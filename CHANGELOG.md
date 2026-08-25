# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- Request adapters for OpenAI, Anthropic, and provider-neutral message payloads.
- Token composition, exact duplication, tool schema, and sensitive-data analyzers.
- Raw-value-free baselines, component-level diffs, and CI contracts.
- Model-specific and user-defined tokenizer registry.
- `straw inspect`, `baseline`, `diff`, and `test` CLI commands.
- Scenario-suite checks and dependency-free OpenAI and Anthropic request capture wrappers.

### Removed

- Legacy context minification and DMD, TOON, XML, JSON, and YAML formatting APIs.
