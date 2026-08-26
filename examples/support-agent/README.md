# Support agent: end-to-end example

This example shows where Straw Context fits in a real development workflow. It uses a fake OpenAI-compatible client, so it requires no API key and makes no network calls.

## Application flow

[`src/support-agent.ts`](src/support-agent.ts) assembles the complete request used by a read-only support agent: model, system instructions, tool schemas, and runtime user input.

[`test/support-agent.test.ts`](test/support-agent.test.ts) demonstrates two testing levels:

1. Build the request directly and assert its contract with `@straw-ai/vitest`.
2. Wrap the provider client and verify the exact request produced by the integration flow before it reaches the provider.

Run it from the repository root:

```bash
pnpm --filter @straw-ai/example-support-agent test
```

## Capture a controlled fixture

[`src/capture-fixture.ts`](src/capture-fixture.ts) captures the integration flow, replaces runtime user input with a representative value, and writes only that sanitized result:

```bash
pnpm --filter @straw-ai/example-support-agent capture
```

The output is [`fixtures/support-read-only.json`](fixtures/support-read-only.json). Capture is an explicit development command; production traffic is never persisted automatically.

## Run the scenario suite

[`straw.scenarios.json`](straw.scenarios.json) applies stable assertions to the fixture:

```bash
pnpm build
pnpm --filter @straw-ai/example-support-agent context:check
```

For GitHub Actions annotations:

```bash
node ../../packages/cli/dist/index.js check straw.scenarios.json --github
```

Run that command with `examples/support-agent` as the working directory.

## See a regression fail

In `buildSupportRequest`, add this tool:

```ts
{
  type: 'function',
  name: 'delete_account',
  description: 'Delete a customer account.',
  parameters: { type: 'object' },
}
```

Then run the test again. The integration test fails before the fake provider call:

```text
Forbidden tool is exposed: Tool "delete_account" is forbidden by this contract.
```

This is Straw Context's intended role: application code continues assembling normal provider requests, while tests and CI catch context-policy regressions introduced by a pull request.
