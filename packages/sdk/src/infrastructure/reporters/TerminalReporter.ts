import { type ContextManifestDiff, type NumericDelta } from '../../application/context/baselines.js'
import { type ContextContractResult } from '../../application/context/contracts.js'
import { TOKEN_COMPOSITION_ANALYZER_ID } from '../../application/context/TokenCompositionAnalyzer.js'
import { type ContextFinding } from '../../domain/context/analyzers.js'
import { type ContextManifest } from '../../domain/context/manifests.js'

function number(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function metricNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function findingLine(finding: ContextFinding): string {
  const location = finding.location?.rawPath ? ` (${finding.location.rawPath})` : ''
  return `  ${finding.severity.toUpperCase().padEnd(7)} ${finding.title}${location}`
}

function deltaLine(label: string, value: NumericDelta): string {
  const sign = value.absolute > 0 ? '+' : ''
  const percent = value.percent === null ? 'n/a' : `${sign}${value.percent}%`
  return `  ${label.padEnd(24)} ${number(value.before).padStart(10)} → ${number(value.after).padStart(10)}  ${percent.padStart(9)}`
}

export function renderContextManifest(manifest: ContextManifest): string {
  const lines = ['Straw Context Report', '', `Request: ${manifest.requestId}`]
  if (manifest.target) lines.push(`Target:  ${manifest.target.provider}/${manifest.target.model}`)

  const tokenMetrics = manifest.analyzers[TOKEN_COMPOSITION_ANALYZER_ID]
  const total = metricNumber(tokenMetrics?.componentTokens)
  if (total !== undefined) {
    lines.push('', `Estimated component tokens: ${number(total)}`)
    const composition = Object.entries(tokenMetrics ?? {})
      .filter(([key, value]) => key.startsWith('tokens.') && typeof value === 'number')
      .map(([key, value]) => [key.slice('tokens.'.length), value as number] as const)
      .sort((left, right) => right[1] - left[1])
    if (composition.length > 0) {
      lines.push('', 'Composition')
      for (const [kind, tokens] of composition) {
        const percent = total === 0 ? 0 : (tokens / total) * 100
        lines.push(`  ${kind.padEnd(20)} ${number(tokens).padStart(10)}  ${percent.toFixed(1)}%`)
      }
    }
  }

  const toolMetrics = manifest.analyzers['tools.schemas']
  const toolCount = metricNumber(toolMetrics?.toolCount)
  if (toolCount !== undefined) {
    lines.push('', `Tools: ${number(toolCount)}`)
    const schemaTokens = metricNumber(toolMetrics?.schemaTokens)
    if (schemaTokens !== undefined) lines.push(`  Estimated schema tokens: ${number(schemaTokens)}`)
    if (typeof toolMetrics?.largestToolId === 'string') {
      lines.push(`  Largest: ${toolMetrics.largestToolId}`)
    }
  }

  const duplicateMetrics = manifest.analyzers['duplication.exact']
  const duplicateComponents = metricNumber(duplicateMetrics?.duplicateComponents)
  if (duplicateComponents !== undefined && duplicateComponents > 0) {
    lines.push('', `Exact duplicate components: ${number(duplicateComponents)}`)
    const duplicateTokens = metricNumber(duplicateMetrics?.duplicateTokens)
    if (duplicateTokens !== undefined) {
      lines.push(`  Estimated duplicate tokens: ${number(duplicateTokens)}`)
    }
  }

  lines.push('', `Findings: ${manifest.findings.length}`)
  if (manifest.findings.length === 0) lines.push('  None')
  else lines.push(...manifest.findings.map(findingLine))

  return lines.join('\n')
}

export function renderContextDiff(diff: ContextManifestDiff): string {
  const lines = [
    'Straw Context Diff',
    '',
    `Baseline: ${diff.beforeRequestId}`,
    `Current:  ${diff.afterRequestId}`,
  ]

  if (diff.componentTokens) {
    lines.push('', 'Token change', deltaLine('all components', diff.componentTokens))
  }

  const kindEntries = Object.entries(diff.tokensByKind)
  if (kindEntries.length > 0) {
    lines.push('', 'Composition changes')
    for (const [kind, value] of kindEntries) {
      if (value) lines.push(deltaLine(kind, value))
    }
  }

  if (diff.components.length > 0) {
    lines.push('', 'Changed components')
    for (const component of diff.components) {
      const tokenChange = component.tokens
        ? ` (${component.tokens.absolute > 0 ? '+' : ''}${number(component.tokens.absolute)} tokens)`
        : ''
      const flags = [
        component.contentChanged ? 'content' : '',
        component.structureChanged ? 'structure' : '',
      ].filter(Boolean)
      const changed = flags.length > 0 ? ` [${flags.join(', ')}]` : ''
      lines.push(
        `  ${component.status.toUpperCase().padEnd(8)} ${component.id}${tokenChange}${changed}`,
      )
    }
  }

  if (diff.findings.length > 0) {
    lines.push('', 'Findings', ...diff.findings.map(findingLine))
  }

  return lines.join('\n')
}

export function renderContextContractResult(result: ContextContractResult): string {
  const lines = [
    'Straw Context Contract',
    '',
    `Contract: ${result.contract}`,
    `Result:   ${result.passed ? 'PASS' : 'FAIL'}`,
    '',
    `Findings: ${result.findings.length}`,
  ]
  if (result.findings.length === 0) lines.push('  None')
  else lines.push(...result.findings.map(findingLine))
  return lines.join('\n')
}
