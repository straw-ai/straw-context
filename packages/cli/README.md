# `@straw-ai/cli`

Command-line context inspection and regression testing for LLM requests.

## Commands

```bash
straw inspect request.json [--adapter openai|anthropic|message] [--json]
straw baseline request.json --output context.baseline.json [--adapter ...]
straw diff context.baseline.json request.json [--adapter ...] [--json]
straw test request.json --contract context.contract.json [--baseline context.baseline.json] [--adapter ...] [--json]
straw check straw.scenarios.json [--json]
```

`inspect` reports token composition, tools, exact duplication, and sensitive-data findings. `baseline` writes a comparison artifact without raw component values. `diff` attributes changes to components and context kinds. `test` enforces one contract. `check` runs a complete scenario suite. Policy failures exit with status `1`.

OpenAI is the default adapter. Use `--adapter anthropic` for Anthropic Messages or `--adapter message` for the provider-neutral message shape.

Token counts from the OpenAI tokenizer are marked `high`. Anthropic and unknown models use an explicitly `estimated` character-based fallback in the CLI.

## Writing development fixtures

`@straw-ai/cli/capture` exports `createJsonFixtureWriter` for use with the SDK's `createContractCaptureHandler`. The writer requires a sanitizer callback and saves exactly its return value:

```ts
import { createJsonFixtureWriter } from '@straw-ai/cli/capture'

const fixture = createJsonFixtureWriter({
  directory: './test/fixtures',
  fileName: () => 'support-read-only.json',
  sanitize: ({ request }) => ({ model: request.target?.model, input: '[redacted]' }),
})
```

This is intended for controlled integration-test data. It does not automatically persist production requests or decide which fields are safe.

See the [repository README](../../README.md) for the complete contract format, baseline privacy notes, and SDK example.

## License

MIT
