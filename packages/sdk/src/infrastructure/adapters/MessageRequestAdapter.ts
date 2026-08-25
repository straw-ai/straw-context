import {
  createContextRequest,
  type ContextEncoding,
  type ContextRequest,
  type ContextSegment,
  type ContextSegmentKind,
} from '../../domain/context/models.js'

export interface MessageRequestAdapterOptions {
  readonly id?: string
  readonly source?: string
  readonly provider?: string
  readonly instructionRoles?: readonly string[]
  readonly toolResultRoles?: readonly string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function encodingFor(value: unknown): ContextEncoding {
  return typeof value === 'string' ? 'text' : 'json'
}

function roleOf(value: unknown): string | undefined {
  return isRecord(value) && typeof value.role === 'string' ? value.role : undefined
}

function toolName(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  return typeof value.name === 'string' ? value.name : undefined
}

/**
 * Adapts the common `{ system, tools, messages }` shape used by provider wrappers.
 * It only annotates existing values; it never rewrites the raw request.
 */
export function adaptMessageRequest(
  raw: Record<string, unknown>,
  options: MessageRequestAdapterOptions = {},
): ContextRequest {
  const segments: ContextSegment[] = []
  const source = options.source
  const instructionRoles = new Set(options.instructionRoles ?? ['system', 'developer'])
  const toolResultRoles = new Set(options.toolResultRoles ?? ['tool'])
  const add = (id: string, kind: ContextSegmentKind, rawPath: string, value: unknown): void => {
    segments.push({
      id,
      kind,
      encoding: encodingFor(value),
      rawPath,
      value,
      ...(source ? { source } : {}),
    })
  }

  if (raw.system !== undefined) add('system', 'instruction', '/system', raw.system)

  if (Array.isArray(raw.tools)) {
    raw.tools.forEach((tool, index) => {
      add(`tool:${toolName(tool) ?? index}:${index}`, 'tool-definition', `/tools/${index}`, tool)
    })
  }

  if (Array.isArray(raw.messages)) {
    raw.messages.forEach((message, index) => {
      const role = roleOf(message)
      const kind: ContextSegmentKind =
        role && instructionRoles.has(role)
          ? 'instruction'
          : role && toolResultRoles.has(role)
            ? 'tool-result'
            : 'message'
      add(`messages:${index}`, kind, `/messages/${index}`, message)
    })
  }

  const provider =
    options.provider ??
    (typeof raw.provider === 'string' && raw.provider.trim() ? raw.provider : undefined)
  const model = typeof raw.model === 'string' && raw.model.trim() ? raw.model : undefined
  return createContextRequest({
    id: options.id ?? 'message-request',
    raw,
    segments,
    ...(provider && model ? { target: { provider, model } } : {}),
  })
}
