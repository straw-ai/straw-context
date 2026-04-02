# @straw-ai/sdk

**Isomorphic Context Minification & Semantic Distillation for LLMs.**

Straw is a zero-dependency, deterministic utility designed to strip the "syntactic tax" from your LLM prompts. It transforms verbose JSON payloads into **Dense Markdown Data (DMD)**, cutting token consumption by up to 75% without losing reasoning accuracy.

## The Problem: The JSON Tax

Modern LLMs have massive context windows, but they are expensive and suffer from "Attention Decay."

- **Syntactic Waste:** Brackets, quotes, and braces in JSON consume ~20-30% of your token budget.
- **Noise:** UUIDs, SHAs, nulls, and metadata URLs dilute the model's focus.
- **Cost:** You are paying OpenAI/Anthropic to process curly braces instead of business logic.

## The Solution: Semantic Distillation

Straw acts as a **Semantic ETL** between your API and your Prompt. It prunes, aliases, and formats data into a structure optimized for the Transformer's attention mechanism using a high-performance **Unified O(N) Pipeline**.

### Key Features

- **Input Guard**: Automatically categorizes data (Structured vs. Unstructured) and performs **Semantic Line Deduplication** for verbose logs.
- **Deterministic Scrubber**: Recursive removal of `null`, `undefined`, and high-token noise keys via **Wildcard Support** (e.g., `*_id`).
- **IdAliaser**: Replaces 36-char UUIDs and 40-char SHAs with short tokens (`$ID_0`) and provides a `reverseMap` for programmatic write-backs.
- **Table-Sense**: detect arrays of similar objects and format them as Markdown tables, even with partial key overlap.
- **DMD Formatter**: Converts objects into **Dense Markdown Data**—a structural indentation format that LLMs natively understand better than JSON.
- **Isomorphic**: Runs anywhere—Node.js, Edge, Bun, or the Browser.

---

## Installation

```bash
npm install @straw-ai/sdk
```

## Quick Start

```typescript
import { distill } from '@straw-ai/sdk'

const rawData = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  user: { name: 'Josh', role: 'admin' },
  metadata: { login_ip: '127.0.0.1', last_seen: '2024-03-25T13:45:00Z' },
}

const { contextString, reverseMap } = distill(rawData, {
  enableAliasing: true,
  relativeDates: true,
  dropKeys: ['login_ip', 'metadata.*'], // Supports wildcards!
})

// Resulting DMD:
// user:
//   name: Josh
//   role: admin
// metadata:
//   last_seen: 1 week ago
// id: $ID_0
```

## Technical Philosophy

`@straw-ai/sdk` follows the **Zero-Retention Principle**.

- **Offline & Local**: No data ever leaves your server/client to be minified.
- **O(N) Complexity**: All transformations (Scrub, Alias, Date) happen in a single pass.
- **Privacy by Design**: Sensitive IDs are aliased before they hit third-party LLM APIs.

---

## License

MIT
