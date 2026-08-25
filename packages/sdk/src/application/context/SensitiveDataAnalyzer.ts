import {
  type AnalyzerResult,
  type ContextAnalyzer,
  type ContextFinding,
} from '../../domain/context/analyzers.js'
import { type ContextRequest, type ContextSegment } from '../../domain/context/models.js'

export const SENSITIVE_DATA_ANALYZER_ID = 'security.input'

export interface SensitiveDataAnalyzerOptions {
  /** JSON Pointer or dot-path globs. `*` matches one path part and `**` matches any depth. */
  readonly forbiddenPaths?: readonly string[]
  readonly detectSecrets?: boolean
}

type SecretKind = 'authorization credential' | 'API token' | 'JWT' | 'private key'

function escapePointer(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1')
}

function patternParts(pattern: string): readonly string[] {
  const trimmed = pattern.trim()
  if (!trimmed) throw new TypeError('Forbidden path patterns must not be empty.')
  return trimmed.startsWith('/')
    ? trimmed.slice(1).split('/').filter(Boolean)
    : trimmed.split('.').filter(Boolean).map(escapePointer)
}

function pathParts(path: string): readonly string[] {
  return path.slice(1).split('/').filter(Boolean)
}

function matches(parts: readonly string[], pattern: readonly string[], pi = 0, gi = 0): boolean {
  if (gi === pattern.length) return pi === parts.length
  if (pattern[gi] === '**') {
    return (
      matches(parts, pattern, pi, gi + 1) ||
      (pi < parts.length && matches(parts, pattern, pi + 1, gi))
    )
  }
  return pi < parts.length && (pattern[gi] === '*' || pattern[gi] === parts[pi])
    ? matches(parts, pattern, pi + 1, gi + 1)
    : false
}

function secretKind(value: string, key: string | undefined): SecretKind | undefined {
  if (key && /^(authorization|proxy-authorization)$/i.test(key) && /\S/.test(value)) {
    return 'authorization credential'
  }
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value)) return 'private key'
  if (/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(value)) {
    return 'JWT'
  }
  if (/\b(?:sk-(?:proj-)?|gh[pousr]_|xox[baprs]-)[A-Za-z0-9_-]{16,}\b/.test(value)) {
    return 'API token'
  }
  return undefined
}

function finding(
  rule: string,
  title: string,
  message: string,
  segment: ContextSegment,
  rawPath: string,
): ContextFinding {
  return {
    rule,
    severity: 'error',
    evidence: 'deterministic',
    title,
    message,
    location: {
      segmentId: segment.id,
      rawPath,
      ...(segment.source ? { source: segment.source } : {}),
    },
  }
}

/** Detects explicitly forbidden fields and a deliberately small set of high-confidence secrets. */
export class SensitiveDataAnalyzer implements ContextAnalyzer {
  readonly id = SENSITIVE_DATA_ANALYZER_ID
  private readonly patterns: readonly (readonly string[])[]
  private readonly detectSecrets: boolean

  constructor(options: SensitiveDataAnalyzerOptions = {}) {
    this.patterns = Object.freeze((options.forbiddenPaths ?? []).map(patternParts))
    this.detectSecrets = options.detectSecrets ?? true
  }

  analyze(request: ContextRequest): AnalyzerResult {
    const findings: ContextFinding[] = []
    let forbiddenPathMatches = 0
    let secretMatches = 0

    for (const segment of request.segments) {
      const seen = new WeakSet<object>()
      const visit = (value: unknown, rawPath: string, key?: string): void => {
        const parts = pathParts(rawPath)
        if (this.patterns.some((pattern) => matches(parts, pattern))) {
          forbiddenPathMatches += 1
          findings.push(
            finding(
              'security.forbidden-path',
              'Forbidden input path included',
              `The assembled LLM request includes a field blocked by policy at ${rawPath}.`,
              segment,
              rawPath,
            ),
          )
        }

        if (this.detectSecrets && typeof value === 'string') {
          const kind = secretKind(value, key)
          if (kind) {
            secretMatches += 1
            findings.push(
              finding(
                'security.secret',
                'Likely secret included',
                `A high-confidence ${kind} pattern was found at ${rawPath}; the value is not retained.`,
                segment,
                rawPath,
              ),
            )
          }
        }

        if (typeof value !== 'object' || value === null || seen.has(value)) return
        seen.add(value)
        if (Array.isArray(value)) {
          value.forEach((item, index) => visit(item, `${rawPath}/${index}`, String(index)))
        } else {
          for (const [childKey, item] of Object.entries(value as Record<string, unknown>)) {
            visit(item, `${rawPath}/${escapePointer(childKey)}`, childKey)
          }
        }
      }
      visit(segment.value, segment.rawPath)
    }

    return {
      metrics: {
        forbiddenPathMatches,
        secretMatches,
        matches: forbiddenPathMatches + secretMatches,
      },
      findings: Object.freeze(findings),
    }
  }
}
