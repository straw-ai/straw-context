# `@straw-ai/context`

Composable static analysis and regression testing for assembled LLM requests.

> **Status:** this package is in early development and is not published to npm yet.

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
} from '@straw-ai/context'

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

## Capture real integration-test requests

Wrap an existing provider client to observe the exact payload before it is sent:

```ts
import { captureOpenAIClient } from '@straw-ai/context'

const captured = []
const client = captureOpenAIClient(openai, {
  onCapture: ({ operation, request }) => {
    captured.push({ operation, raw: request.raw })
  },
})

await client.responses.create(yourNormalRequest)
```

`captureAnthropicClient` wraps `messages.create`; `captureOpenAIClient` wraps both `responses.create` and `chat.completions.create`. The callback runs before the provider call. If it throws or rejects—such as when an inline contract fails—the provider is not called.

Wrappers do not write files, call a model, or import provider SDKs. Applications decide whether to analyze in memory or save sanitized development fixtures. Do not persist production user requests without an explicit data-handling policy.

Use the official handler to enforce a contract in memory:

```ts
import { captureOpenAIClient, createContractCaptureHandler } from '@straw-ai/context'

const client = captureOpenAIClient(openai, {
  onCapture: createContractCaptureHandler({
    contract: {
      name: 'support-read-only',
      tokens: { maxComponentTokens: 12000 },
      tools: { forbidden: ['delete_account'] },
    },
  }),
})
```

Contract violations reject before the provider call. Set `failOnViolation: false` to observe results without blocking and use `onResult` to receive the manifest and evaluation. Pass `baseline` (or a baseline resolver callback) when enforcing regression or structural rules.

For explicit development fixture output, combine the handler with the Node writer from `@straw-ai/cli/capture`. A sanitizer is mandatory:

```ts
import { createJsonFixtureWriter } from '@straw-ai/cli/capture'

const fixture = createJsonFixtureWriter({
  directory: './test/fixtures',
  fileName: () => 'support-read-only.json',
  sanitize: ({ request }) => ({
    ...(request.raw as object),
    input: '[representative test input]',
  }),
})

const onCapture = createContractCaptureHandler({ contract, fixture })
```

The writer persists exactly the sanitizer's return value. It does not claim to infer which application fields are safe.

## Baselines and diffs

```ts
import { createContextBaseline, diffContextManifest } from '@straw-ai/context'

const baseline = createContextBaseline(manifest)
const diff = diffContextManifest(baseline, nextManifest)
```

Baselines omit raw component values but retain metrics and non-cryptographic fingerprints. Diffs report added, removed, and changed components, content and structure changes, and token deltas by context kind.

## Contracts

Use `parseContextContract` for JSON configuration and `evaluateContextContract` for CI enforcement.

```ts
import { evaluateContextContract, parseContextContract } from '@straw-ai/context'

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
