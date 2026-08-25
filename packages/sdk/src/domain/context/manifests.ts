import {
  type AnalyzerMetric,
  type AnalysisContext,
  type ContextAnalyzer,
  type ContextFinding,
} from './analyzers.js'
import { fingerprintContextStructure, fingerprintContextValue } from './fingerprints.js'
import { type ContextRequest, type ContextSegmentKind, type ModelTarget } from './models.js'

export interface ContextComponentManifest {
  readonly id: string
  readonly kind: ContextSegmentKind
  readonly encoding: string
  readonly rawPath: string
  readonly source?: string
  readonly contentFingerprint: string
  readonly structureFingerprint: string
  readonly analyzers: Readonly<Record<string, Readonly<Record<string, AnalyzerMetric>>>>
}

export interface ContextManifest {
  readonly schemaVersion: 1
  readonly requestId: string
  readonly target?: ModelTarget
  readonly components: readonly ContextComponentManifest[]
  readonly analyzers: Readonly<Record<string, Readonly<Record<string, AnalyzerMetric>>>>
  readonly findings: readonly ContextFinding[]
}

/** Runs analyzers and produces the stable data model consumed by reporters and CI policies. */
export async function createContextManifest(
  request: ContextRequest,
  analyzers: readonly ContextAnalyzer[],
  context: AnalysisContext,
): Promise<ContextManifest> {
  const analyzerIds = new Set<string>()
  const metrics: Record<string, Readonly<Record<string, AnalyzerMetric>>> = {}
  const componentMetrics: Record<
    string,
    Record<string, Readonly<Record<string, AnalyzerMetric>>>
  > = Object.fromEntries(request.segments.map((segment) => [segment.id, {}]))
  const findings: ContextFinding[] = []

  for (const analyzer of analyzers) {
    if (!analyzer.id.trim()) {
      throw new TypeError('Analyzer id must not be empty.')
    }
    if (analyzerIds.has(analyzer.id)) {
      throw new TypeError(`Duplicate analyzer id: "${analyzer.id}".`)
    }
    analyzerIds.add(analyzer.id)

    const result = await analyzer.analyze(request, context)
    metrics[analyzer.id] = result.metrics ? Object.freeze({ ...result.metrics }) : Object.freeze({})
    for (const [segmentId, analyzerMetrics] of Object.entries(result.componentMetrics ?? {})) {
      const component = componentMetrics[segmentId]
      if (!component) {
        throw new TypeError(
          `Analyzer "${analyzer.id}" returned metrics for unknown segment "${segmentId}".`,
        )
      }
      component[analyzer.id] = Object.freeze({ ...analyzerMetrics })
    }
    findings.push(...(result.findings ?? []))
  }

  const components = request.segments.map((segment) =>
    Object.freeze({
      id: segment.id,
      kind: segment.kind,
      encoding: segment.encoding,
      rawPath: segment.rawPath,
      ...(segment.source ? { source: segment.source } : {}),
      contentFingerprint: fingerprintContextValue(segment.value),
      structureFingerprint: fingerprintContextStructure(segment.value),
      analyzers: Object.freeze(componentMetrics[segment.id] ?? {}),
    }),
  )

  const manifest: ContextManifest = {
    schemaVersion: 1,
    requestId: request.id,
    ...(request.target ? { target: request.target } : {}),
    components: Object.freeze(components),
    analyzers: Object.freeze(metrics),
    findings: Object.freeze(findings),
  }

  return Object.freeze(manifest)
}
