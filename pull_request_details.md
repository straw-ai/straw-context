# PR Title: 🚀 feat(sdk): expose ContextDistiller configuration and refine Input Guard

## Description

This PR introduces comprehensive configuration options for the `ContextDistiller` SDK, allowing developers to fine-tune the distillation process. It specifically focuses on exposing the internal pre-processing and deduplication heuristics, giving users control over how unstructured data (like logs) is handled.

### Key Changes

- **Flexible Configuration Schema**: Added `DedupeOptions` and expanded `DistillOptions` in `types.ts` to include `enableInputGuard` and `dedupe` settings.
- **Refined Input Guard**: Updated the `distill` logic in `index.ts` to respect the `enableInputGuard` flag and provide a clearer path for both structured and unstructured data processing.
- **Configurable Semantic Line Deduplication**: Modified `deduplicateLines` in `preprocessor.ts` to use configurable parameters:
  - `enabled`: Toggle deduplication on/off.
  - `threshold`: Set the minimum number of consecutive lines to trigger deduplication.
  - `prefixLength`: Adjust the number of characters used for prefix matching.
  - `contextBuffer`: Control how many lines are kept at the start and end of a deduplicated block.
- **Enhanced Test Suite**: Added new tests in `distiller.test.ts` to verify that the SDK correctly respects the new configuration options, including disabling the input guard and customizing deduplication behavior.

### Testing

- ✅ Added unit tests for custom deduplication thresholds.
- ✅ Added unit tests for disabling deduplication via configuration.
- ✅ Added unit tests for disabling the entire Input Guard.
- ✅ Verified all existing tests pass with the new changes.

## Related Issues

Connected to: [Implementing ContextDistiller Core Engine] (Conversation e6666299)
