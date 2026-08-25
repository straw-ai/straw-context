// Context analysis foundation
export {
  createContextRequest,
  type ContextEncoding,
  type ContextRequest,
  type ContextSegment,
  type ContextSegmentKind,
  type CreateContextRequestInput,
  type ModelTarget,
} from './domain/context/models.js'
export {
  TokenizerNotFoundError,
  TokenizerRegistry,
  type ContextTokenizer,
  type TokenEstimate,
  type TokenEstimateAccuracy,
} from './domain/context/tokenizers.js'
export {
  type AnalysisContext,
  type AnalyzerMetric,
  type AnalyzerResult,
  type ContextAnalyzer,
  type ContextFinding,
  type FindingEvidence,
  type FindingLocation,
  type FindingSeverity,
} from './domain/context/analyzers.js'
export {
  createContextManifest,
  type ContextComponentManifest,
  type ContextManifest,
} from './domain/context/manifests.js'
export {
  fingerprintContextStructure,
  fingerprintContextValue,
} from './domain/context/fingerprints.js'
export { serializeContextSegment } from './domain/context/serialization.js'
export {
  TOKEN_COMPOSITION_ANALYZER_ID,
  TokenCompositionAnalyzer,
  type SegmentSerializer,
  type TokenCompositionAnalyzerOptions,
} from './application/context/TokenCompositionAnalyzer.js'
export {
  EXACT_DUPLICATION_ANALYZER_ID,
  ExactDuplicationAnalyzer,
  type ExactDuplicationAnalyzerOptions,
} from './application/context/ExactDuplicationAnalyzer.js'
export {
  TOOL_SCHEMA_ANALYZER_ID,
  ToolSchemaAnalyzer,
  type ToolSchemaAnalyzerOptions,
} from './application/context/ToolSchemaAnalyzer.js'
export {
  SENSITIVE_DATA_ANALYZER_ID,
  SensitiveDataAnalyzer,
  type SensitiveDataAnalyzerOptions,
} from './application/context/SensitiveDataAnalyzer.js'
export {
  createContextBaseline,
  diffContextManifest,
  type ComponentChangeStatus,
  type ContextBaseline,
  type ContextBaselineComponent,
  type ContextComponentDiff,
  type ContextManifestDiff,
  type NumericDelta,
} from './application/context/baselines.js'
export {
  evaluateContextContract,
  type ContextContract,
  type ContextContractResult,
  type ContractEvaluationOptions,
  type TokenBudgetContract,
  type TokenRegressionContract,
  type SensitiveDataContract,
  type ToolContract,
  type DuplicationContract,
  type StructureContract,
} from './application/context/contracts.js'
export {
  ContextConfigurationError,
  parseContextBaseline,
  parseContextContract,
} from './application/context/validation.js'
export {
  adaptOpenAIRequest,
  type OpenAIRequestAdapterOptions,
} from './infrastructure/adapters/OpenAIRequestAdapter.js'
export {
  adaptMessageRequest,
  type MessageRequestAdapterOptions,
} from './infrastructure/adapters/MessageRequestAdapter.js'
export {
  adaptAnthropicRequest,
  type AnthropicRequestAdapterOptions,
} from './infrastructure/adapters/AnthropicRequestAdapter.js'
export {
  renderContextContractResult,
  renderContextDiff,
  renderContextManifest,
} from './infrastructure/reporters/TerminalReporter.js'
export {
  OpenAITokenizer,
  type OpenAITokenizerOptions,
} from './infrastructure/tokenizers/OpenAITokenizer.js'
