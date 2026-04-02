# ContextDistiller: Technical Architecture

The `ContextDistiller` is a unified ingest and minification pipeline designed to convert diverse data types (JSON, Logs, Arrays) into **Dense Markdown Data (DMD)**.

## Core Flow

```mermaid
graph TD
    Input[Data Input] --> IG[Input Guard]
    IG --> |String| PP[Pre-Processor]
    PP --> |Plain Text| UN[Unstructured Pipeline]
    PP --> |JSON String| ST[Structured Pipeline]
    IG --> |Object/Array| ST

    UN --> DL[Deduplicate Lines]
    DL --> TR[Truncate String]
    TR --> Result[DMD Output]

    ST --> UP[Unified Pipeline O(N)]
    UP --> |Scrub| UP
    UP --> |Date Format| UP
    UP --> |Alias| UP
    UP --> FM[DMD / Table Formatter]
    FM --> Result
```

## Internal API (Functions & Classes)

### 1. Main Entry Points

- **Class**: `ContextDistiller` (in `index.ts`)
  - `static distill(input, options)`: The main orchestration method.
  - `private static estimateTokens(text)`: Heuristic-based token estimation.
- **Function**: `distill(input, options)`: Exported helper function for functional usage.

### 2. Input Guard & Pre-Processing (`preprocessor.ts`)

- `identifyInput(input)`: Categorizes data into `structured` (objects) or `unstructured` (strings/logs).
- `tryParseJSON(input)`: Automatically detects and parses JSON strings to switch to the higher-efficiency structured pipeline.
- `deduplicateLines(text)`: Minifies repetitive logs like `[INFO]` while preserving context (first 2/last 2 lines).

### 3. The Unified Walker (`engines.ts`)

The core transformation is handled by `distillPayload()`, which performs a single recursive pass **O(N)** over the data tree:

- **Engine A (Scrub)**: Prunes noise and handles wildcard patterns (`*_id`).
- **Engine C (Alias)**: Replaces high-entropy identifiers (UUIDs) with `$ID_0`.
- **Engine E (Dates)**: detection and relative-stay conversion (`3 days ago`).

### 4. DMD Formatter (`engines.ts`)

- `formatToDMD(input, options)`: Converts the processed object tree into indented Markdown.
- `formatAsTable(arr, indent)`: Converts arrays with >80% key overlap into Markdown tables (Table-Sense).
- **Robustness**: Handles nested objects and pipe symbol escaping to ensure valid Markdown output.

## DMD Format (Dense Markdown Data)

Unlike verbose JSON, DMD is designed for LLM attention:

- **Indentation-based**: Uses 2-space indentation to define hierarchy.
- **Key-Value Clarity**: `key: value` pairs instead of `{"key": "value"}`.
- **Compressed Collections**: Repetitive data structures are table-ified to minimize token footprint.
