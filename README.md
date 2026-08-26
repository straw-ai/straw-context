# Straw Context

Static analysis and regression testing for the request your application sends to an LLM.

> **Status:** early development. The packages documented here are not published to npm yet.

Start with the runnable [`examples/support-agent`](examples/support-agent/README.md) walkthrough. It covers application request assembly, Vitest assertions, provider capture, sanitized fixtures, scenario checks, and a deliberate failing regression without requiring an API key.

Straw turns an assembled OpenAI, Anthropic, or provider-neutral request into a stable manifest. It shows where the context window goes, detects deterministic input problems, and lets CI compare the request against a reviewed baseline and contract.

```text
application request → adapter → analyzers → manifest → baseline/diff/contract → CI result
```

## Why analyze the assembled request?

Prompt files are only part of an LLM call. Applications also attach message history, tool schemas, retrieved documents, memory, and tool results. Changes to those can silently increase cost, expose a dangerous tool, duplicate context, include a forbidden field, or alter component structure.

Straw inspects that final request before it crosses the provider boundary. It complements prompt evals and production observability: evals test behavior, observability records live calls, and Straw enforces deterministic request-shape policy in development and CI.

## What Straw does

- Breaks requests into instructions, tool definitions, messages, tool results, retrieval, memory, attachments, and custom components.
- Measures token composition with a model-specific or user-provided tokenizer.
- Profiles tool schemas and rejects duplicate tool names.
- Detects exact duplicate components and estimates their token waste.
- Detects explicit forbidden JSON paths and a narrow set of high-confidence secret formats.
- Creates baselines and attributes changes by component and context kind.
- Enforces token, regression, tool, duplication, sensitive-data, and structural contracts.

Straw does not judge prompt quality, predict answer quality, or provide broad PII classification. Built-in checks are intentionally deterministic, local, and do not send request content to an AI model.

## Packages

- `@straw-ai/context`: adapters, analyzers, manifests, baselines, contracts, reporters, and tokenizer extension points.
- `@straw-ai/cli`: `inspect`, `baseline`, `diff`, and `test` commands.
- `@straw-ai/vitest`: async context-contract matchers for application tests.

## CLI quick start

```bash
pnpm install
pnpm build

node packages/cli/dist/index.js inspect request.json
node packages/cli/dist/index.js baseline request.json --output context.baseline.json
node packages/cli/dist/index.js diff context.baseline.json request.json
node packages/cli/dist/index.js test request.json --contract context.contract.json --baseline context.baseline.json
node packages/cli/dist/index.js check straw.scenarios.json
```

OpenAI is the default adapter. Other request shapes are explicit:

```bash
straw inspect request.json --adapter anthropic
straw inspect request.json --adapter message
```

| Adapter     | Request shape                                          |
| ----------- | ------------------------------------------------------ |
| `openai`    | Responses API and Chat Completions                     |
| `anthropic` | Anthropic Messages, including block-level tool results |
| `message`   | `{ provider, model, system, tools, messages }`         |

## Contract example

```json
{
  "name": "support-agent",
  "tokens": {
    "maxComponentTokens": 12000,
    "byKind": { "tool-definition": 3000, "retrieval": 6000 }
  },
  "regression": { "maxIncrease": 500, "maxIncreasePercent": 10 },
  "tools": {
    "maxCount": 12,
    "required": ["search"],
    "forbidden": ["delete_account"]
  },
  "duplication": { "maxDuplicateComponents": 0, "maxDuplicateTokens": 0 },
  "sensitiveData": {
    "forbiddenPaths": ["**.customer.ssn", "/messages/*/metadata/internalNotes"],
    "detectSecrets": true
  },
  "structure": { "maxAdded": 1, "maxRemoved": 0, "maxChanged": 0 }
}
```

`straw test` exits with status `1` on failure. Regression and structural rules require `--baseline`.

## Scenario suites

Use representative development fixtures to enforce stable invariants across application flows:

```json
{
  "scenarios": [
    {
      "name": "support-read-only",
      "request": "fixtures/support-request.json",
      "adapter": "openai",
      "contract": {
        "tokens": { "maxComponentTokens": 12000 },
        "tools": { "maxCount": 10, "forbidden": ["delete_account"] },
        "sensitiveData": { "forbiddenPaths": ["**.ssn"] }
      }
    }
  ]
}
```

Paths are resolved relative to the suite file. Each scenario may also reference a `baseline`; use that only for stable fixtures or components. `straw check` runs every scenario and returns one CI result.

For native GitHub Actions annotations:

```yaml
- name: Check LLM context scenarios
  run: straw check straw.scenarios.json --github
```

For direct integration tests, install `@straw-ai/vitest` and assert against the assembled request:

```ts
import { adaptOpenAIRequest } from '@straw-ai/context'
import '@straw-ai/vitest'

it('keeps read-only context within policy', async () => {
  const request = adaptOpenAIRequest(buildSupportRequest())
  await expect(request).toMatchContextContract({
    name: 'support-read-only',
    tokens: { maxComponentTokens: 12000 },
    tools: { forbidden: ['delete_account'] },
  })
})
```

Provider capture wrappers can collect the real payloads created by integration tests:

```ts
import { captureOpenAIClient } from '@straw-ai/context'

const client = captureOpenAIClient(openai, {
  onCapture: ({ request }) => saveDevelopmentFixture(request.raw),
})

await client.responses.create(yourNormalRequest)
```

Capture happens before the provider call and supports OpenAI Responses, OpenAI Chat Completions, and Anthropic Messages. Straw does not automatically persist captured data; fixture storage must be an explicit application choice.

## Baseline privacy

Baselines do not store raw prompts, messages, schemas, or detected secret values. They contain metrics plus deterministic content and structure fingerprints.

Fingerprints are non-cryptographic change identifiers, not anonymization. A baseline can disclose component IDs, paths, kinds, token counts, and whether content changed. Review it before committing when names or paths are sensitive.

## Token accuracy

Every count is labeled `exact`, `high`, or `estimated`.

- `OpenAITokenizer` uses `js-tiktoken` and is marked `high`: encoding is model-aware, but provider-side request framing can add tokens.
- Anthropic and unknown providers use the CLI's character estimate unless a compatible tokenizer is registered.
- The SDK accepts synchronous or asynchronous custom tokenizers and selects the highest-priority compatible implementation.

Straw rejects token-regression contracts across different provider/model targets.

## SDK example

```ts
import {
  adaptOpenAIRequest,
  createContextManifest,
  ExactDuplicationAnalyzer,
  OpenAITokenizer,
  SensitiveDataAnalyzer,
  TokenCompositionAnalyzer,
  TokenizerRegistry,
  ToolSchemaAnalyzer,
} from '@straw-ai/context'

const request = adaptOpenAIRequest({
  model: 'gpt-4.1-mini',
  instructions: 'Answer using the available tools.',
  tools: [{ type: 'function', name: 'search', parameters: { type: 'object' } }],
  input: [{ role: 'user', content: 'Find invoice 42.' }],
})

const tokenizers = new TokenizerRegistry().register(new OpenAITokenizer())
const manifest = await createContextManifest(
  request,
  [
    new TokenCompositionAnalyzer(),
    new ExactDuplicationAnalyzer(),
    new ToolSchemaAnalyzer(),
    new SensitiveDataAnalyzer({ forbiddenPaths: ['**.ssn'] }),
  ],
  { tokenizers },
)
```

See [`packages/sdk/README.md`](packages/sdk/README.md) for SDK extension points.

## Development

```bash
pnpm build
pnpm test
pnpm lint
```

## License

MIT
