# `@straw-ai/sdk`

Composable static analysis and regression testing for assembled LLM requests.

## Install

```bash
npm install @straw-ai/sdk
```

## Analysis pipeline

An adapter produces a provider-independent `ContextRequest` while preserving the untouched raw payload. Analyzers produce metrics and findings. The manifest can then be rendered, converted into a baseline, diffed, or evaluated against a contract.

```ts
import {
  adaptAnthropicRequest,
  createContextManifest,
  ExactDuplicationAnalyzer,
  SensitiveDataAnalyzer,
  TokenCompositionAnalyzer,
  TokenizerRegistry,
  ToolSchemaAnalyzer,
} from '@straw-ai/sdk'

const request = adaptAnthropicRequest({
  model: 'claude-model',
  system: 'Be concise.',
  tools: [{ name: 'search', input_schema: { type: 'object' } }],
  messages: [{ role: 'user', content: 'Find the invoice.' }],
})

const tokenizers = new TokenizerRegistry().register({
  id: 'anthropic-counter',
  priority: 100,
  accuracy: 'high',
  supports: ({ provider }) => provider === 'anthropic',
  count: async (text, target) => countWithYourTokenizer(text, target.model),
})

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

## Adapters

- `adaptOpenAIRequest`: OpenAI Responses and Chat Completions.
- `adaptAnthropicRequest`: Anthropic Messages with block-level components.
- `adaptMessageRequest`: generic `{ provider, model, system, tools, messages }` requests and configurable roles.
- `createContextRequest`: extension point for framework-specific adapters and retrieval, memory, or attachment components.

Adapters annotate existing values; they do not rewrite the raw request.

## Tokenizers

`TokenizerRegistry` accepts custom `ContextTokenizer` implementations. They declare supported provider/model targets, priority, and accuracy; counting may be synchronous or asynchronous.

`OpenAITokenizer` uses `js-tiktoken`. Results are marked `high`, not `exact`, because Straw counts serialized components rather than reproducing all provider-side framing. No Anthropic tokenizer is bundled.

## Analyzers

| Analyzer                   | Output                                               |
| -------------------------- | ---------------------------------------------------- |
| `TokenCompositionAnalyzer` | Total and per-kind/component token estimates         |
| `ExactDuplicationAnalyzer` | Exact repeated components and estimated waste        |
| `ToolSchemaAnalyzer`       | Tool count, names, schema size, duplicate names      |
| `SensitiveDataAnalyzer`    | Explicit forbidden paths and high-confidence secrets |

Sensitive-data analysis is not broad PII classification. It performs deterministic local checks and never includes matched secret values in findings.

## Baselines and diffs

```ts
import { createContextBaseline, diffContextManifest } from '@straw-ai/sdk'

const baseline = createContextBaseline(manifest)
const diff = diffContextManifest(baseline, nextManifest)
```

Baselines omit raw component values but retain metrics and non-cryptographic fingerprints. Diffs report added, removed, and changed components, content and structure changes, and token deltas by context kind.

## Contracts

Use `parseContextContract` for JSON configuration and `evaluateContextContract` for CI enforcement.

```ts
import { evaluateContextContract, parseContextContract } from '@straw-ai/sdk'

const contract = parseContextContract({
  name: 'support-agent',
  tokens: { maxComponentTokens: 12000 },
  tools: { required: ['search'], forbidden: ['delete_account'] },
  duplication: { maxDuplicateComponents: 0 },
  structure: { maxChanged: 0 },
})

const result = evaluateContextContract(nextManifest, contract, { baseline })
if (!result.passed) process.exitCode = 1
```

Contract categories are `tokens`, `regression`, `tools`, `duplication`, `sensitiveData`, and `structure`. Contracts fail closed when a required analyzer, tokenizer measurement, or baseline is unavailable. Analyzer errors are contract failures.

## License

MIT
