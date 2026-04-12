// Application Services
export { StrawService, distill, analyze, type StrawConfig } from './application/StrawService.js'

// Specialized Formatters
export { LeanFormatter } from './application/formatters/LeanFormatter.js'
export { AnalyticalFormatter } from './application/formatters/AnalyticalFormatter.js'

// Domain Models & Types
export {
  type StrawOptions,
  type StrawResult,
  type StrawAnalysis,
  type OutputFormat,
  type NormalizationOptions,
  type TokenCounter,
} from './domain/distiller/models.js'

// Domain Entities
export { type AliaserRule } from './domain/distiller/entities.js'

// Errors
export { DistillError } from './domain/distiller/errors.js'
