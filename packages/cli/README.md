# `@straw-ai/cli`

Command-line context inspection and regression testing for LLM requests.

## Commands

```bash
straw inspect request.json [--adapter openai|anthropic|message] [--json]
straw baseline request.json --output context.baseline.json [--adapter ...]
straw diff context.baseline.json request.json [--adapter ...] [--json]
straw test request.json --contract context.contract.json [--baseline context.baseline.json] [--adapter ...] [--json]
```

`inspect` reports token composition, tools, exact duplication, and sensitive-data findings. `baseline` writes a comparison artifact without raw component values. `diff` attributes changes to components and context kinds. `test` enforces a contract and exits `1` when it fails.

OpenAI is the default adapter. Use `--adapter anthropic` for Anthropic Messages or `--adapter message` for the provider-neutral message shape.

Token counts from the OpenAI tokenizer are marked `high`. Anthropic and unknown models use an explicitly `estimated` character-based fallback in the CLI.

See the [repository README](../../README.md) for the complete contract format, baseline privacy notes, and SDK example.

## License

MIT
