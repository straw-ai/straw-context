# Straw

**Isomorphic Context Minification & Semantic Distillation for LLMs.**

Straw is a zero-dependency, deterministic utility designed to strip the "syntactic tax" from your LLM prompts. It transforms verbose JSON payloads into **Dense Markdown Data (DMD)**, cutting token consumption by up to 80% without losing reasoning accuracy.

## The Problem: The JSON Tax

Modern LLMs have massive context windows, but they are expensive and suffer from "Attention Decay."

- **Syntactic Waste:** Brackets, quotes, and braces in JSON consume ~20-30% of your token budget.
- **Noise:** UUIDs, SHAs, nulls, and metadata URLs dilute the model's focus.
- **Cost:** You are paying OpenAI/Anthropic to process curly braces instead of business logic.

## The Solution: Semantic Distillation

Straw acts as a **Semantic ETL** between your API and your Prompt. It prunes, aliases, and formats data into a structure optimized for the Transformer's attention mechanism.

### Key Features

- **Deterministic Scrubber**: Recursive removal of `null`, `undefined`, and high-token noise keys (`avatar_url`, `css`, `node_id`).
- **IdAliaser**: Replaces 36-char UUIDs and 40-char SHAs with short pointers (`$ID_0`) and provides a `ReverseMap` for programmatic write-backs.
- **DMD Formatter**: Converts objects into **Dense Markdown Data**—a structural indentation format that LLMs natively understand better than JSON.
- **Isomorphic**: Runs anywhere—Node.js, Vercel Edge, Bun, or the Browser.

---

## Installation

```bash
npm install TBD
```

## Quick Start

```typescript
import { ContextMinifier } from '@straw-ai/sdk'

const rawData = await fetch('https://api.github.com/repos/owner/repo/pulls/1')

const { output, idMap } = ContextMinifier.minify(rawData, {
  aliasIds: true,
  relativeDates: true,
  dropKeys: ['_links', 'node_id'],
})

// Pass 'output' to your LLM. Use 'idMap' to map $ID_X back to real IDs.
```

## Benchmarks

| Input Source          | Raw JSON (Tokens) | Straw Minified (Tokens) | Savings   |
| :-------------------- | :---------------- | :---------------------- | :-------- |
| **GitHub PR Payload** | 4,820             | 940                     | **80.5%** |
| **Linear Issue List** | 3,150             | 1,120                   | **64.4%** |
| **Stripe Customer**   | 1,200             | 410                     | **65.8%** |

---

## Technical Philosophy

`straw-sdk` follows the **Zero-Retention Principle**.

- **Offline & Local**: No data ever leaves your server/client to be minified.
- **No LLM Required**: All minification is deterministic code.
- **Privacy by Design**: Sensitive IDs are aliased before they hit third-party LLM APIs.

## License

MIT

---

### Why the name Straw?

Because we find the **Straw** that breaks the context window's back. We keep your prompts light, dense, and meaningful.
