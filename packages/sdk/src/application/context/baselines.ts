import { type AnalyzerMetric, type ContextFinding } from '../../domain/context/analyzers.js'
import {
  type ContextComponentManifest,
  type ContextManifest,
} from '../../domain/context/manifests.js'
import { type ContextSegmentKind, type ModelTarget } from '../../domain/context/models.js'
import { TOKEN_COMPOSITION_ANALYZER_ID } from './TokenCompositionAnalyzer.js'

export interface ContextBaselineComponent {
  readonly id: string
  readonly kind: ContextSegmentKind
  readonly source?: string
  readonly contentFingerprint: string
  readonly structureFingerprint: string
  readonly metrics: Readonly<Record<string, AnalyzerMetric>>
}

/** Content-free snapshot suitable for committing to source control. */
export interface ContextBaseline {
  readonly schemaVersion: 1
  readonly requestId: string
  readonly target?: ModelTarget
  readonly metrics: Readonly<Record<string, AnalyzerMetric>>
  readonly components: readonly ContextBaselineComponent[]
}

export interface NumericDelta {
  readonly before: number
  readonly after: number
  readonly absolute: number
  readonly percent: number | null
}

export type ComponentChangeStatus = 'added' | 'removed' | 'changed'

export interface ContextComponentDiff {
  readonly id: string
  readonly kind: ContextSegmentKind
  readonly status: ComponentChangeStatus
  readonly tokens?: NumericDelta
  readonly contentChanged?: boolean
  readonly structureChanged?: boolean
  readonly source?: string
}

export interface ContextManifestDiff {
  readonly beforeRequestId: string
  readonly afterRequestId: string
  readonly componentTokens?: NumericDelta
  readonly tokensByKind: Readonly<Partial<Record<ContextSegmentKind, NumericDelta>>>
  readonly components: readonly ContextComponentDiff[]
  readonly findings: readonly ContextFinding[]
}

function numericMetric(
  metrics: Readonly<Record<string, AnalyzerMetric>>,
  key: string,
): number | undefined {
  const value = metrics[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function delta(before: number, after: number): NumericDelta {
  const absolute = after - before
  return {
    before,
    after,
    absolute,
    percent: before === 0 ? null : Number(((absolute / before) * 100).toFixed(1)),
  }
}

function componentTokens(
  component: ContextComponentManifest | ContextBaselineComponent,
): number | undefined {
  const metrics =
    'analyzers' in component
      ? component.analyzers[TOKEN_COMPOSITION_ANALYZER_ID]
      : component.metrics
  return metrics ? numericMetric(metrics, 'tokens') : undefined
}

/** Removes raw content and findings while retaining stable analysis measurements. */
export function createContextBaseline(manifest: ContextManifest): ContextBaseline {
  const metrics = manifest.analyzers[TOKEN_COMPOSITION_ANALYZER_ID] ?? {}
  const components = manifest.components.map((component) =>
    Object.freeze({
      id: component.id,
      kind: component.kind,
      ...(component.source ? { source: component.source } : {}),
      contentFingerprint: component.contentFingerprint,
      structureFingerprint: component.structureFingerprint,
      metrics: Object.freeze({
        ...component.analyzers[TOKEN_COMPOSITION_ANALYZER_ID],
      }),
    }),
  )

  return Object.freeze({
    schemaVersion: 1,
    requestId: manifest.requestId,
    ...(manifest.target ? { target: manifest.target } : {}),
    metrics: Object.freeze({ ...metrics }),
    components: Object.freeze(components),
  })
}

export function diffContextManifest(
  before: ContextBaseline,
  after: ContextManifest,
): ContextManifestDiff {
  const findings: ContextFinding[] = []
  const beforeTotal = numericMetric(before.metrics, 'componentTokens')
  const afterMetrics = after.analyzers[TOKEN_COMPOSITION_ANALYZER_ID] ?? {}
  const afterTotal = numericMetric(afterMetrics, 'componentTokens')
  const beforeComponents = new Map(before.components.map((component) => [component.id, component]))
  const afterComponents = new Map(after.components.map((component) => [component.id, component]))
  const componentDiffs: ContextComponentDiff[] = []

  for (const beforeComponent of before.components) {
    const afterComponent = afterComponents.get(beforeComponent.id)
    if (!afterComponent) {
      const tokens = componentTokens(beforeComponent)
      componentDiffs.push({
        id: beforeComponent.id,
        kind: beforeComponent.kind,
        status: 'removed',
        ...(tokens === undefined ? {} : { tokens: delta(tokens, 0) }),
        ...(beforeComponent.source ? { source: beforeComponent.source } : {}),
      })
      continue
    }

    const beforeTokens = componentTokens(beforeComponent)
    const afterTokens = componentTokens(afterComponent)
    const contentChanged = beforeComponent.contentFingerprint !== afterComponent.contentFingerprint
    const structureChanged =
      beforeComponent.structureFingerprint !== afterComponent.structureFingerprint
    const tokensChanged =
      beforeTokens !== undefined && afterTokens !== undefined && beforeTokens !== afterTokens
    if (tokensChanged || contentChanged || structureChanged) {
      componentDiffs.push({
        id: afterComponent.id,
        kind: afterComponent.kind,
        status: 'changed',
        ...(beforeTokens === undefined || afterTokens === undefined
          ? {}
          : { tokens: delta(beforeTokens, afterTokens) }),
        ...(contentChanged ? { contentChanged: true } : {}),
        ...(structureChanged ? { structureChanged: true } : {}),
        ...(afterComponent.source ? { source: afterComponent.source } : {}),
      })
    }
  }

  for (const afterComponent of after.components) {
    if (beforeComponents.has(afterComponent.id)) continue
    const tokens = componentTokens(afterComponent)
    componentDiffs.push({
      id: afterComponent.id,
      kind: afterComponent.kind,
      status: 'added',
      ...(tokens === undefined ? {} : { tokens: delta(0, tokens) }),
      ...(afterComponent.source ? { source: afterComponent.source } : {}),
    })
  }

  const tokensByKind: Partial<Record<ContextSegmentKind, NumericDelta>> = {}
  const kinds = new Set<ContextSegmentKind>([
    ...before.components.map((component) => component.kind),
    ...after.components.map((component) => component.kind),
  ])
  for (const kind of kinds) {
    const beforeTokens = numericMetric(before.metrics, `tokens.${kind}`) ?? 0
    const afterTokens = numericMetric(afterMetrics, `tokens.${kind}`) ?? 0
    if (beforeTokens !== afterTokens) tokensByKind[kind] = delta(beforeTokens, afterTokens)
  }

  if (beforeTotal === undefined || afterTotal === undefined) {
    findings.push({
      rule: 'diff.tokens-unavailable',
      severity: 'warning',
      evidence: 'deterministic',
      title: 'Token totals unavailable',
      message: 'Both baseline and current manifest require token composition metrics.',
    })
  }

  if (
    before.target?.provider !== after.target?.provider ||
    before.target?.model !== after.target?.model
  ) {
    findings.push({
      rule: 'diff.target-mismatch',
      severity: 'warning',
      evidence: 'deterministic',
      title: 'Model target changed',
      message: `Baseline target ${before.target ? `${before.target.provider}/${before.target.model}` : '(none)'} does not match current target ${after.target ? `${after.target.provider}/${after.target.model}` : '(none)'}.`,
    })
  }

  return Object.freeze({
    beforeRequestId: before.requestId,
    afterRequestId: after.requestId,
    ...(beforeTotal === undefined || afterTotal === undefined
      ? {}
      : { componentTokens: delta(beforeTotal, afterTotal) }),
    tokensByKind: Object.freeze(tokensByKind),
    components: Object.freeze(componentDiffs),
    findings: Object.freeze(findings),
  })
}
