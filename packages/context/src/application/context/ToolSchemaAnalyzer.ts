import {
  type AnalyzerMetric,
  type AnalyzerResult,
  type AnalysisContext,
  type ContextAnalyzer,
  type ContextFinding,
} from '../../domain/context/analyzers.js'
import { type ContextRequest, type ContextSegment } from '../../domain/context/models.js'
import { serializeContextSegment } from '../../domain/context/serialization.js'

export interface ToolSchemaAnalyzerOptions {
  readonly maxTokensPerTool?: number
  readonly serialize?: (segment: ContextSegment) => string
}

export const TOOL_SCHEMA_ANALYZER_ID = 'tools.schemas'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toolName(segment: ContextSegment): string | undefined {
  if (!isRecord(segment.value)) return undefined
  if (typeof segment.value.name === 'string') return segment.value.name
  const functionDefinition = segment.value.function
  return isRecord(functionDefinition) && typeof functionDefinition.name === 'string'
    ? functionDefinition.name
    : undefined
}

/** Profiles exposed tool definitions and flags duplicate names or oversized schemas. */
export class ToolSchemaAnalyzer implements ContextAnalyzer {
  public readonly id = TOOL_SCHEMA_ANALYZER_ID
  private readonly maxTokensPerTool: number | undefined
  private readonly serialize: (segment: ContextSegment) => string

  constructor(options: ToolSchemaAnalyzerOptions = {}) {
    if (
      options.maxTokensPerTool !== undefined &&
      (!Number.isSafeInteger(options.maxTokensPerTool) || options.maxTokensPerTool < 0)
    ) {
      throw new TypeError('maxTokensPerTool must be a non-negative safe integer.')
    }
    this.maxTokensPerTool = options.maxTokensPerTool
    this.serialize = options.serialize ?? serializeContextSegment
  }

  public async analyze(request: ContextRequest, context: AnalysisContext): Promise<AnalyzerResult> {
    const tools = request.segments.filter((segment) => segment.kind === 'tool-definition')
    const findings: ContextFinding[] = []
    const componentMetrics: Record<string, Record<string, AnalyzerMetric>> = {}
    const names = new Map<string, ContextSegment>()
    let schemaCharacters = 0
    let schemaTokens = 0
    let countedTools = 0
    let largestTool: ContextSegment | undefined
    let largestToolTokens = -1

    for (const tool of tools) {
      const name = toolName(tool)
      if (name) {
        const original = names.get(name)
        if (original) {
          findings.push({
            rule: 'tools.duplicate-name',
            severity: 'error',
            evidence: 'deterministic',
            title: 'Duplicate tool name',
            message: `Tool name "${name}" is also used by component "${original.id}".`,
            location: {
              segmentId: tool.id,
              rawPath: tool.rawPath,
              ...(tool.source ? { source: tool.source } : {}),
            },
          })
        } else {
          names.set(name, tool)
        }
      }

      const serialized = this.serialize(tool)
      schemaCharacters += serialized.length
      componentMetrics[tool.id] = {
        characters: serialized.length,
        ...(name ? { name } : {}),
      }

      if (!request.target) continue
      try {
        const estimate = await context.tokenizers.count(serialized, request.target)
        schemaTokens += estimate.tokens
        countedTools += 1
        componentMetrics[tool.id] = {
          ...componentMetrics[tool.id],
          tokens: estimate.tokens,
          tokenizer: estimate.tokenizer,
          accuracy: estimate.accuracy,
        }
        if (estimate.tokens > largestToolTokens) {
          largestTool = tool
          largestToolTokens = estimate.tokens
        }
        if (this.maxTokensPerTool !== undefined && estimate.tokens > this.maxTokensPerTool) {
          findings.push({
            rule: 'tools.schema-budget',
            severity: 'error',
            evidence: 'estimated',
            title: 'Tool schema budget exceeded',
            message: `Tool "${name ?? tool.id}" uses approximately ${estimate.tokens} tokens; the limit is ${this.maxTokensPerTool}.`,
            location: {
              segmentId: tool.id,
              rawPath: tool.rawPath,
              ...(tool.source ? { source: tool.source } : {}),
            },
            metrics: {
              actual: estimate.tokens,
              limit: this.maxTokensPerTool,
              exceededBy: estimate.tokens - this.maxTokensPerTool,
            },
          })
        }
      } catch (error) {
        findings.push({
          rule: 'tools.tokens-unavailable',
          severity: 'warning',
          evidence: 'deterministic',
          title: 'Tool token count unavailable',
          message: error instanceof Error ? error.message : String(error),
          location: { segmentId: tool.id, rawPath: tool.rawPath },
        })
      }
    }

    const metrics: Record<string, AnalyzerMetric> = {
      toolCount: tools.length,
      namedToolCount: names.size,
      schemaCharacters,
      countedToolCount: countedTools,
      ...(countedTools > 0 ? { schemaTokens } : {}),
      ...(largestTool ? { largestToolId: largestTool.id, largestToolTokens } : {}),
    }

    return { metrics, componentMetrics, findings }
  }
}
