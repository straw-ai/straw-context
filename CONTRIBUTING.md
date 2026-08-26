# Contributing to Straw Context

Thanks for helping improve Straw Context. The project is currently a technical preview, so focused feedback about real context-assembly workflows is especially valuable.

## Development setup

Requirements:

- Node.js 20
- pnpm 10.25.0

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm lint
pnpm format:check
pnpm turbo run spellcheck
```

The runnable [`examples/support-agent`](examples/support-agent/README.md) project is the best starting point for understanding the intended workflow.

## Pull requests

- Keep changes scoped and include tests for observable behavior.
- Preserve deterministic, local analysis. Do not add network calls to core analyzers.
- Clearly label estimated measurements; do not present them as exact.
- Never commit real prompts, user conversations, credentials, or production traces as fixtures.
- Update documentation when changing public APIs, contracts, scenarios, or CLI behavior.
- Add a Changesets entry for user-facing package changes with `pnpm changeset`.

Pull requests must pass the same build, test, lint, formatting, spellcheck, and Changesets checks defined in [CI](.github/workflows/ci.yml).

## Reporting bugs and proposing features

Open a GitHub issue with a minimal reproduction and describe the assembled request shape, expected policy, and actual result. Sanitize all example data before sharing it.
