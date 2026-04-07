# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-beta.0] - 2026-04-07

### Added

- **Core Distiller Engine**: Implemented the primary `distill` pipeline for context minification.
- **Dense Markdown Data (DMD)**: Introduced a custom Markdown-based format optimized for LLM token savings.
- **Input Guard**: Automated detection and routing of structured (JSON) vs. unstructured (Logs) data.
- **Aliaser**: Support for replacing UUIDs and SHAs with short, unique tokens to save space.
- **Budgeter**: Token-aware pruning to ensure prompts fit within specific LLM context windows.
- **PII Redaction**: Rule-based engine for scrubbing sensitive information (emails, keys, etc.).
- **Semantic Line Deduplication**: Heursitics for cleaning up verbose repetitive log data.
- **Presets**: Pre-built configurations for OpenAI, Anthropic, and Gemini.

### Changed

- Refactored the distillation process into a unified single-pass performance pipeline.
- Optimized table detection and formatting for DMD.

### Fixed

- Improved handling of circular references in recursive object traversal.
- Fixed token calculation edge cases for empty or null inputs.
