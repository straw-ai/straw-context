# @straw-ai/sdk

**High-Performance, Lossless Structural Minifier for LLM Context.**

Straw is a zero-dependency, isomorphic engine designed to strip the "syntactic tax" from your structured JSON data before it hits an LLM. By transforming verbose Objects and Arrays into **Dense Markdown Data (DMD)** and **Token Oriented Object Notation (TOON v2)**, Straw optimizes your data for the Transformer's attention mechanism, slashing token costs without losing a single key or character.

---

## ⚡ The Enterprise Reset: Deterministic & Lossless

Straw has been sharpened for **High-Fidelity Context Engineering**. It is not a generalized ETL tool; it is a specialized machine-to-machine translator that guarantees structural integrity.

### 🎯 Who is this for?

- **Enterprise Engineering**: If you need to inject massive datasets into LLM context without risking data loss or "key dropping."
- **RAG & Agent Engineers**: If you are hitting context limits and need to maximize the token efficiency of every byte sent to the model.
- **Cost-Conscious Teams**: If you want to cut your OpenAI/Anthropic bill by 30-50% purely by eliminating redundant brackets, braces, and quotes.

### 🚫 Who is this NOT for?

- **Lossy Compression**: Straw does NOT drop keys or truncate strings. It is a strictly lossless transformer.
- **Unstructured Log Parsing**: Straw assumes your data is already structured (Object or Array).
- **Human-First Debugging**: DMD and TOON are designed for LLMs. If you need 100% human-pretty JSON for a UI, stick to `JSON.stringify`.

---

## 📦 Installation

```bash
npm install @straw-ai/sdk
# or
pnpm add @straw-ai/sdk
```

---

## 🚀 Quick Start (Lossless Translation)

Initialize Straw to see immediate token savings with zero data loss.

```typescript
import { distill } from '@straw-ai/sdk'

const data = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  user: {
    name: 'Josh',
    role: 'admin',
    metadata: null, // Normalizes to ∅
  },
  tags: ['beta', 'internal'],
}

const { contextString } = distill(data, {
  enableAliasing: true, // Replaces UUIDs with $UUID_0
})

console.log(contextString)
/*
user:
  name: Josh
  role: admin
  metadata: ∅
tags: [beta, internal]
id: $UUID_0
*/
```

---

## 📂 Deep Dives: Formatting Engines

### [DMD] Dense Markdown Data

Nested objects are transformed into a structural indentation format. Unlike JSON, DMD removes the "bracket tax" while maintaining the semantic hierarchy that LLMs natively understand.

**JSON (95 tokens):**

```json
{
  "user": {
    "profile": {
      "settings": { "theme": "dark", "notifications": true }
    }
  }
}
```

**DMD (63 tokens):**

```markdown
user:
profile:
settings:
theme: dark
notifications: true
```

### [TOON] Token Oriented Object Notation

When Straw detects an array of similar objects, it performs a **Union-Scan** of all keys and produces a high-density Markdown table. This is significantly more efficient than repeating keys for every array item.

**TOON Output:**

```markdown
users[3]{name,role,status}:
Josh,admin,active
Sarah,member,∅
Michael,guest,active
```

_(Note: Straw uses the mathematically concise `∅` as a zero-token placeholder for missing heterogeneous values)._

---

## 🔄 Handling Aliases (Reverse Mapping)

If you enable `enableAliasing`, Straw replaces high-entropy strings (UUIDs, SHAs) with short tokens like `$UUID_0`. To map these back to your database IDs after an LLM response:

```typescript
const { contextString, reverseMap } = distill(data, { enableAliasing: true })

// LLM responds: "The user $UUID_0 should be promoted."
const llmResponse = '...'

let finalOutput = llmResponse
reverseMap.forEach((originalValue, alias) => {
  finalOutput = finalOutput.replace(alias, originalValue)
})
```

---

## 🛠 API Reference: DistillOptions

| Option           | Type       | Default     | Description                                        |
| :--------------- | :--------- | :---------- | :------------------------------------------------- |
| `enableAliasing` | `boolean`  | `false`     | Replaces UUIDs/SHAs with pointers.                 |
| `tableifyArrays` | `boolean`  | `false`     | Enables TOON (Markdown Table) formatting.          |
| `outputFormat`   | `string`   | `dmd`       | `dmd` \| `toon` \| `xml` \| `json` \| `yaml`       |
| `normalization`  | `Object`   | `{}`        | Options for `null`/`undefined` substitution.       |
| `tokenCounter`   | `Function` | `undefined` | Used for generating statistics. `(text) => number` |

---

## ⚖️ Technical Philosophy

1. **Deterministic & Lossless**: Straw never drops keys or truncates data. It is stable, 1:1 structural translation.
2. **Enterprise Ready**: Specialized for high-throughput, zero-trust context engineering.
3. **Privacy First**: Sensitive IDs are aliased locally via the Aliaser engine.
4. **Isomorphic**: Runs in Node.js, Browsers, Edge Workers, and Bun.

---

## License

MIT
