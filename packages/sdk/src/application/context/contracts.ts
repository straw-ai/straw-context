import { type AnalyzerMetric, type ContextFinding } from '../../domain/context/analyzers.js'
import { type ContextManifest } from '../../domain/context/manifests.js'
import { type ContextSegmentKind } from '../../domain/context/models.js'
import { type ContextBaseline, diffContextManifest } from './baselines.js'
import { EXACT_DUPLICATION_ANALYZER_ID } from './ExactDuplicationAnalyzer.js'
import { TOKEN_COMPOSITION_ANALYZER_ID } from './TokenCompositionAnalyzer.js'
import { TOOL_SCHEMA_ANALYZER_ID } from './ToolSchemaAnalyzer.js'

export interface TokenBudgetContract {
  readonly maxComponentTokens?: number
  readonly byKind?: Readonly<Partial<Record<ContextSegmentKind, number>>>
}

export interface TokenRegressionContract {
  readonly maxIncrease?: number
  readonly maxIncreasePercent?: number
}

export interface SensitiveDataContract {
  readonly forbiddenPaths?: readonly string[]
  readonly detectSecrets?: boolean
}

export interface ToolContract {
  readonly maxCount?: number
  readonly required?: readonly string[]
  readonly forbidden?: readonly string[]
}

export interface DuplicationContract {
  readonly maxDuplicateComponents?: number
  readonly maxDuplicateTokens?: number
}

export interface StructureContract {
  readonly maxAdded?: number
  readonly maxRemoved?: number
  readonly maxChanged?: number
}

export interface ContextContract {
  readonly name: string
  readonly tokens?: TokenBudgetContract
  readonly regression?: TokenRegressionContract
  readonly sensitiveData?: SensitiveDataContract
  readonly tools?: ToolContract
  readonly duplication?: DuplicationContract
  readonly structure?: StructureContract
}

export interface ContractEvaluationOptions {
  readonly baseline?: ContextBaseline
}

export interface ContextContractResult {
  readonly contract: string
  readonly passed: boolean
  readonly findings: readonly ContextFinding[]
}

function numericMetric(
  metrics: Readonly<Record<string, AnalyzerMetric>>,
  key: string,
): number | undefined {
  const value = metrics[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function validateLimit(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new TypeError(`${name} must be a non-negative finite number.`)
  }
}

function budgetFinding(rule: string, title: string, actual: number, limit: number): ContextFinding {
  return {
    rule,
    severity: 'error',
    evidence: 'estimated',
    title,
    message: `Estimated component tokens ${actual} exceed the configured limit of ${limit}.`,
    metrics: { actual, limit, exceededBy: actual - limit },
  }
}

export function evaluateContextContract(
  manifest: ContextManifest,
  contract: ContextContract,
  options: ContractEvaluationOptions = {},
): ContextContractResult {
  if (!contract.name.trim()) throw new TypeError('Context contract name must not be empty.')
  validateLimit(contract.tokens?.maxComponentTokens, 'tokens.maxComponentTokens')
  validateLimit(contract.regression?.maxIncrease, 'regression.maxIncrease')
  validateLimit(contract.regression?.maxIncreasePercent, 'regression.maxIncreasePercent')
  validateLimit(contract.tools?.maxCount, 'tools.maxCount')
  validateLimit(contract.duplication?.maxDuplicateComponents, 'duplication.maxDuplicateComponents')
  validateLimit(contract.duplication?.maxDuplicateTokens, 'duplication.maxDuplicateTokens')
  validateLimit(contract.structure?.maxAdded, 'structure.maxAdded')
  validateLimit(contract.structure?.maxRemoved, 'structure.maxRemoved')
  validateLimit(contract.structure?.maxChanged, 'structure.maxChanged')

  // Analyzer errors are policy violations in CI; warnings and informational findings remain reports.
  const findings: ContextFinding[] = manifest.findings.filter(
    (finding) => finding.severity === 'error',
  )
  const metrics = manifest.analyzers[TOKEN_COMPOSITION_ANALYZER_ID]
  if (contract.tokens && !metrics) {
    findings.push({
      rule: 'contract.tokens-unavailable',
      severity: 'error',
      evidence: 'deterministic',
      title: 'Token composition is unavailable',
      message: 'Run TokenCompositionAnalyzer before evaluating token budgets.',
    })
  }

  if (metrics && contract.tokens?.maxComponentTokens !== undefined) {
    const actual = numericMetric(metrics, 'componentTokens')
    if (actual === undefined) {
      findings.push({
        rule: 'contract.tokens-unavailable',
        severity: 'error',
        evidence: 'deterministic',
        title: 'Total component tokens are unavailable',
        message: 'The token composition manifest does not contain componentTokens.',
      })
    } else if (actual > contract.tokens.maxComponentTokens) {
      findings.push(
        budgetFinding(
          'contract.tokens.total-budget',
          'Context token budget exceeded',
          actual,
          contract.tokens.maxComponentTokens,
        ),
      )
    }
  }

  if (metrics && contract.tokens?.byKind) {
    for (const [kind, limit] of Object.entries(contract.tokens.byKind)) {
      if (limit === undefined) continue
      validateLimit(limit, `tokens.byKind.${kind}`)
      const actual = numericMetric(metrics, `tokens.${kind}`) ?? 0
      if (actual > limit) {
        findings.push(
          budgetFinding(
            `contract.tokens.${kind}-budget`,
            `${kind} token budget exceeded`,
            actual,
            limit,
          ),
        )
      }
    }
  }

  if (contract.tools) {
    const toolMetrics = manifest.analyzers[TOOL_SCHEMA_ANALYZER_ID]
    if (!toolMetrics) {
      findings.push({
        rule: 'contract.tools-unavailable',
        severity: 'error',
        evidence: 'deterministic',
        title: 'Tool analysis is unavailable',
        message: 'Run ToolSchemaAnalyzer before evaluating tool policies.',
      })
    } else {
      const toolCount = numericMetric(toolMetrics, 'toolCount')
      if (
        contract.tools.maxCount !== undefined &&
        toolCount !== undefined &&
        toolCount > contract.tools.maxCount
      ) {
        findings.push({
          rule: 'contract.tools.max-count',
          severity: 'error',
          evidence: 'deterministic',
          title: 'Tool count exceeded',
          message: `The request exposes ${toolCount} tools; the limit is ${contract.tools.maxCount}.`,
          metrics: { actual: toolCount, limit: contract.tools.maxCount },
        })
      }
      const names = new Set(
        manifest.components.flatMap((component) => {
          const name = component.analyzers[TOOL_SCHEMA_ANALYZER_ID]?.name
          return typeof name === 'string' ? [name] : []
        }),
      )
      for (const name of contract.tools.required ?? []) {
        if (!names.has(name)) {
          findings.push({
            rule: 'contract.tools.required',
            severity: 'error',
            evidence: 'deterministic',
            title: 'Required tool is missing',
            message: `Required tool "${name}" is not exposed by this request.`,
          })
        }
      }
      for (const name of contract.tools.forbidden ?? []) {
        if (names.has(name)) {
          findings.push({
            rule: 'contract.tools.forbidden',
            severity: 'error',
            evidence: 'deterministic',
            title: 'Forbidden tool is exposed',
            message: `Tool "${name}" is forbidden by this contract.`,
          })
        }
      }
    }
  }

  if (contract.duplication) {
    const duplicateMetrics = manifest.analyzers[EXACT_DUPLICATION_ANALYZER_ID]
    if (!duplicateMetrics) {
      findings.push({
        rule: 'contract.duplication-unavailable',
        severity: 'error',
        evidence: 'deterministic',
        title: 'Duplication analysis is unavailable',
        message: 'Run ExactDuplicationAnalyzer before evaluating duplication policies.',
      })
    } else {
      const duplicateComponents = numericMetric(duplicateMetrics, 'duplicateComponents') ?? 0
      const componentLimit = contract.duplication.maxDuplicateComponents
      if (componentLimit !== undefined && duplicateComponents > componentLimit) {
        findings.push({
          rule: 'contract.duplication.components',
          severity: 'error',
          evidence: 'deterministic',
          title: 'Duplicate component limit exceeded',
          message: `${duplicateComponents} duplicate components exceed the limit of ${componentLimit}.`,
          metrics: { actual: duplicateComponents, limit: componentLimit },
        })
      }
      const tokenLimit = contract.duplication.maxDuplicateTokens
      if (tokenLimit !== undefined) {
        const duplicateTokens = numericMetric(duplicateMetrics, 'duplicateTokens')
        const duplicateGroups = numericMetric(duplicateMetrics, 'duplicateGroups') ?? 0
        if (duplicateTokens === undefined && duplicateGroups > 0) {
          findings.push({
            rule: 'contract.duplication-tokens-unavailable',
            severity: 'error',
            evidence: 'deterministic',
            title: 'Duplicate token count is unavailable',
            message: 'A compatible tokenizer is required to enforce duplicate token limits.',
          })
        } else if ((duplicateTokens ?? 0) > tokenLimit) {
          findings.push({
            rule: 'contract.duplication.tokens',
            severity: 'error',
            evidence: 'estimated',
            title: 'Duplicate token limit exceeded',
            message: `Approximately ${duplicateTokens} duplicate tokens exceed the limit of ${tokenLimit}.`,
            metrics: { actual: duplicateTokens ?? 0, limit: tokenLimit },
          })
        }
      }
    }
  }

  if (contract.structure) {
    if (!options.baseline) {
      findings.push({
        rule: 'contract.structure-baseline-missing',
        severity: 'error',
        evidence: 'deterministic',
        title: 'Structure baseline is missing',
        message: 'Structure limits require a baseline.',
      })
    } else {
      const components = diffContextManifest(options.baseline, manifest).components
      const counts = {
        added: components.filter((item) => item.status === 'added').length,
        removed: components.filter((item) => item.status === 'removed').length,
        changed: components.filter((item) => item.status === 'changed' && item.structureChanged)
          .length,
      }
      for (const [status, limit] of Object.entries(contract.structure)) {
        if (limit === undefined) continue
        const key = status.slice(3).toLowerCase() as keyof typeof counts
        const actual = counts[key]
        if (actual > limit) {
          findings.push({
            rule: `contract.structure.${key}`,
            severity: 'error',
            evidence: 'deterministic',
            title: `Component structure ${key} limit exceeded`,
            message: `${actual} components were ${key}; the limit is ${limit}.`,
            metrics: { actual, limit },
          })
        }
      }
    }
  }

  if (contract.regression) {
    if (!options.baseline) {
      findings.push({
        rule: 'contract.baseline-missing',
        severity: 'error',
        evidence: 'deterministic',
        title: 'Regression baseline is missing',
        message: 'This contract has regression limits but no baseline was provided.',
      })
    } else {
      const diff = diffContextManifest(options.baseline, manifest)
      if (diff.findings.some((finding) => finding.rule === 'diff.target-mismatch')) {
        findings.push({
          rule: 'contract.baseline-target-mismatch',
          severity: 'error',
          evidence: 'deterministic',
          title: 'Baseline model target does not match',
          message: 'Token regressions cannot be enforced across different provider/model targets.',
        })
      }
      const regression = diff.componentTokens
      if (!regression) {
        findings.push({
          rule: 'contract.regression-unavailable',
          severity: 'error',
          evidence: 'deterministic',
          title: 'Token regression is unavailable',
          message: 'The baseline and current manifest must both contain token metrics.',
        })
      } else {
        const maxIncrease = contract.regression.maxIncrease
        if (maxIncrease !== undefined && regression.absolute > maxIncrease) {
          findings.push({
            rule: 'contract.regression.absolute',
            severity: 'error',
            evidence: 'estimated',
            title: 'Absolute token regression exceeded',
            message: `Estimated component tokens increased by ${regression.absolute}; the limit is ${maxIncrease}.`,
            metrics: { actual: regression.absolute, limit: maxIncrease },
          })
        }

        const maxPercent = contract.regression.maxIncreasePercent
        if (
          maxPercent !== undefined &&
          regression.percent !== null &&
          regression.percent > maxPercent
        ) {
          findings.push({
            rule: 'contract.regression.percent',
            severity: 'error',
            evidence: 'estimated',
            title: 'Percentage token regression exceeded',
            message: `Estimated component tokens increased by ${regression.percent}%; the limit is ${maxPercent}%.`,
            metrics: { actual: regression.percent, limit: maxPercent },
          })
        }
      }
    }
  }

  return Object.freeze({
    contract: contract.name,
    passed: !findings.some((finding) => finding.severity === 'error'),
    findings: Object.freeze(findings),
  })
}
