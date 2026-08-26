import { type AnalyzerMetric } from '../../domain/context/analyzers.js'
import { type ContextSegmentKind, type ModelTarget } from '../../domain/context/models.js'
import { type ContextBaseline, type ContextBaselineComponent } from './baselines.js'
import { type ContextContract } from './contracts.js'

const segmentKinds = new Set<ContextSegmentKind>([
  'instruction',
  'tool-definition',
  'message',
  'tool-result',
  'retrieval',
  'memory',
  'attachment',
  'unknown',
])

export class ContextConfigurationError extends TypeError {
  constructor(path: string, message: string) {
    super(`${path}: ${message}`)
    this.name = 'ContextConfigurationError'
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ContextConfigurationError(path, 'expected an object')
  }
  return value as Record<string, unknown>
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedKeys = new Set(allowed)
  const unknown = Object.keys(value).find((key) => !allowedKeys.has(key))
  if (unknown) throw new ContextConfigurationError(`${path}.${unknown}`, 'unknown property')
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ContextConfigurationError(path, 'expected a non-empty string')
  }
  return value
}

function limit(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new ContextConfigurationError(path, 'expected a non-negative finite number')
  }
  return value
}

function optionalLimit(value: unknown, path: string): number | undefined {
  return value === undefined ? undefined : limit(value, path)
}

function optionalBoolean(value: unknown, path: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new ContextConfigurationError(path, 'expected a boolean')
  return value
}

function modelTarget(value: unknown, path: string): ModelTarget {
  const input = record(value, path)
  return Object.freeze({
    provider: string(input.provider, `${path}.provider`),
    model: string(input.model, `${path}.model`),
  })
}

function metrics(value: unknown, path: string): Readonly<Record<string, AnalyzerMetric>> {
  const input = record(value, path)
  const output: Record<string, AnalyzerMetric> = {}
  for (const [key, item] of Object.entries(input)) {
    if (item !== null && !['string', 'number', 'boolean'].includes(typeof item)) {
      throw new ContextConfigurationError(`${path}.${key}`, 'expected a scalar metric')
    }
    if (typeof item === 'number' && !Number.isFinite(item)) {
      throw new ContextConfigurationError(`${path}.${key}`, 'expected a finite metric')
    }
    output[key] = item as AnalyzerMetric
  }
  return Object.freeze(output)
}

export function parseContextContract(value: unknown): ContextContract {
  const input = record(value, 'contract')
  rejectUnknownKeys(
    input,
    ['name', 'tokens', 'regression', 'sensitiveData', 'tools', 'duplication', 'structure'],
    'contract',
  )
  const name = string(input.name, 'contract.name')
  let tokens: ContextContract['tokens']
  if (input.tokens !== undefined) {
    const tokenInput = record(input.tokens, 'contract.tokens')
    rejectUnknownKeys(tokenInput, ['maxComponentTokens', 'byKind'], 'contract.tokens')
    let byKind: Partial<Record<ContextSegmentKind, number>> | undefined
    if (tokenInput.byKind !== undefined) {
      byKind = {}
      for (const [kind, value] of Object.entries(
        record(tokenInput.byKind, 'contract.tokens.byKind'),
      )) {
        if (!segmentKinds.has(kind as ContextSegmentKind)) {
          throw new ContextConfigurationError(
            `contract.tokens.byKind.${kind}`,
            'unknown context segment kind',
          )
        }
        byKind[kind as ContextSegmentKind] = limit(value, `contract.tokens.byKind.${kind}`)
      }
    }
    const maxComponentTokens = optionalLimit(
      tokenInput.maxComponentTokens,
      'contract.tokens.maxComponentTokens',
    )
    tokens = Object.freeze({
      ...(maxComponentTokens === undefined ? {} : { maxComponentTokens }),
      ...(byKind ? { byKind: Object.freeze(byKind) } : {}),
    })
  }

  let regression: ContextContract['regression']
  if (input.regression !== undefined) {
    const regressionInput = record(input.regression, 'contract.regression')
    rejectUnknownKeys(regressionInput, ['maxIncrease', 'maxIncreasePercent'], 'contract.regression')
    const maxIncrease = optionalLimit(
      regressionInput.maxIncrease,
      'contract.regression.maxIncrease',
    )
    const maxIncreasePercent = optionalLimit(
      regressionInput.maxIncreasePercent,
      'contract.regression.maxIncreasePercent',
    )
    regression = Object.freeze({
      ...(maxIncrease === undefined ? {} : { maxIncrease }),
      ...(maxIncreasePercent === undefined ? {} : { maxIncreasePercent }),
    })
  }

  let sensitiveData: ContextContract['sensitiveData']
  if (input.sensitiveData !== undefined) {
    const sensitiveInput = record(input.sensitiveData, 'contract.sensitiveData')
    rejectUnknownKeys(sensitiveInput, ['forbiddenPaths', 'detectSecrets'], 'contract.sensitiveData')
    let forbiddenPaths: readonly string[] | undefined
    if (sensitiveInput.forbiddenPaths !== undefined) {
      if (!Array.isArray(sensitiveInput.forbiddenPaths)) {
        throw new ContextConfigurationError(
          'contract.sensitiveData.forbiddenPaths',
          'expected an array',
        )
      }
      forbiddenPaths = Object.freeze(
        sensitiveInput.forbiddenPaths.map((item, index) =>
          string(item, `contract.sensitiveData.forbiddenPaths[${index}]`),
        ),
      )
    }
    const detectSecrets = optionalBoolean(
      sensitiveInput.detectSecrets,
      'contract.sensitiveData.detectSecrets',
    )
    sensitiveData = Object.freeze({
      ...(forbiddenPaths ? { forbiddenPaths } : {}),
      ...(detectSecrets === undefined ? {} : { detectSecrets }),
    })
  }

  let tools: ContextContract['tools']
  if (input.tools !== undefined) {
    const toolInput = record(input.tools, 'contract.tools')
    rejectUnknownKeys(toolInput, ['maxCount', 'required', 'forbidden'], 'contract.tools')
    const names = (value: unknown, path: string): readonly string[] | undefined => {
      if (value === undefined) return undefined
      if (!Array.isArray(value)) throw new ContextConfigurationError(path, 'expected an array')
      const result = value.map((item, index) => string(item, `${path}[${index}]`))
      if (new Set(result).size !== result.length) {
        throw new ContextConfigurationError(path, 'tool names must be unique')
      }
      return Object.freeze(result)
    }
    const maxCount = optionalLimit(toolInput.maxCount, 'contract.tools.maxCount')
    const required = names(toolInput.required, 'contract.tools.required')
    const forbidden = names(toolInput.forbidden, 'contract.tools.forbidden')
    tools = Object.freeze({
      ...(maxCount === undefined ? {} : { maxCount }),
      ...(required ? { required } : {}),
      ...(forbidden ? { forbidden } : {}),
    })
  }

  let duplication: ContextContract['duplication']
  if (input.duplication !== undefined) {
    const duplicateInput = record(input.duplication, 'contract.duplication')
    rejectUnknownKeys(
      duplicateInput,
      ['maxDuplicateComponents', 'maxDuplicateTokens'],
      'contract.duplication',
    )
    const maxDuplicateComponents = optionalLimit(
      duplicateInput.maxDuplicateComponents,
      'contract.duplication.maxDuplicateComponents',
    )
    const maxDuplicateTokens = optionalLimit(
      duplicateInput.maxDuplicateTokens,
      'contract.duplication.maxDuplicateTokens',
    )
    duplication = Object.freeze({
      ...(maxDuplicateComponents === undefined ? {} : { maxDuplicateComponents }),
      ...(maxDuplicateTokens === undefined ? {} : { maxDuplicateTokens }),
    })
  }

  let structure: ContextContract['structure']
  if (input.structure !== undefined) {
    const structureInput = record(input.structure, 'contract.structure')
    rejectUnknownKeys(
      structureInput,
      ['maxAdded', 'maxRemoved', 'maxChanged'],
      'contract.structure',
    )
    const maxAdded = optionalLimit(structureInput.maxAdded, 'contract.structure.maxAdded')
    const maxRemoved = optionalLimit(structureInput.maxRemoved, 'contract.structure.maxRemoved')
    const maxChanged = optionalLimit(structureInput.maxChanged, 'contract.structure.maxChanged')
    structure = Object.freeze({
      ...(maxAdded === undefined ? {} : { maxAdded }),
      ...(maxRemoved === undefined ? {} : { maxRemoved }),
      ...(maxChanged === undefined ? {} : { maxChanged }),
    })
  }

  return Object.freeze({
    name,
    ...(tokens ? { tokens } : {}),
    ...(regression ? { regression } : {}),
    ...(sensitiveData ? { sensitiveData } : {}),
    ...(tools ? { tools } : {}),
    ...(duplication ? { duplication } : {}),
    ...(structure ? { structure } : {}),
  })
}

export function parseContextBaseline(value: unknown): ContextBaseline {
  const input = record(value, 'baseline')
  if (input.schemaVersion !== 1) {
    throw new ContextConfigurationError('baseline.schemaVersion', 'expected 1')
  }
  if (!Array.isArray(input.components)) {
    throw new ContextConfigurationError('baseline.components', 'expected an array')
  }

  const ids = new Set<string>()
  const components: ContextBaselineComponent[] = input.components.map((value, index) => {
    const path = `baseline.components[${index}]`
    const component = record(value, path)
    const id = string(component.id, `${path}.id`)
    if (ids.has(id)) throw new ContextConfigurationError(`${path}.id`, 'duplicate component id')
    ids.add(id)
    const kind = string(component.kind, `${path}.kind`) as ContextSegmentKind
    if (!segmentKinds.has(kind)) {
      throw new ContextConfigurationError(`${path}.kind`, 'unknown context segment kind')
    }
    return Object.freeze({
      id,
      kind,
      ...(component.source === undefined
        ? {}
        : { source: string(component.source, `${path}.source`) }),
      contentFingerprint: string(component.contentFingerprint, `${path}.contentFingerprint`),
      structureFingerprint: string(component.structureFingerprint, `${path}.structureFingerprint`),
      metrics: metrics(component.metrics, `${path}.metrics`),
    })
  })

  return Object.freeze({
    schemaVersion: 1,
    requestId: string(input.requestId, 'baseline.requestId'),
    ...(input.target === undefined ? {} : { target: modelTarget(input.target, 'baseline.target') }),
    metrics: metrics(input.metrics, 'baseline.metrics'),
    components: Object.freeze(components),
  })
}
