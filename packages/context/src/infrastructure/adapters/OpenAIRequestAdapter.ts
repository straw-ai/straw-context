import {
  createContextRequest,
  type ContextEncoding,
  type ContextRequest,
  type ContextSegment,
  type ContextSegmentKind,
} from '../../domain/context/models.js'

type OpenAIRequest = Record<string, unknown>

export interface OpenAIRequestAdapterOptions {
  readonly id?: string
  readonly source?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function classifyItem(value: unknown): ContextSegmentKind {
  if (!isRecord(value)) return 'message'
  if (value.type === 'function_call_output' || value.role === 'tool') return 'tool-result'
  if (value.role === 'system' || value.role === 'developer') return 'instruction'
  return 'message'
}

function encodingFor(value: unknown): ContextEncoding {
  return typeof value === 'string' ? 'text' : 'json'
}

function openAIToolName(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.name === 'string') return value.name
  return isRecord(value.function) && typeof value.function.name === 'string'
    ? value.function.name
    : undefined
}

/**
 * Annotates OpenAI Responses API and Chat Completions request objects without
 * importing or depending on the OpenAI SDK.
 */
export function adaptOpenAIRequest(
  raw: OpenAIRequest,
  options: OpenAIRequestAdapterOptions = {},
): ContextRequest {
  const segments: ContextSegment[] = []
  const source = options.source

  if (raw.instructions !== undefined) {
    segments.push({
      id: 'instructions',
      kind: 'instruction',
      encoding: encodingFor(raw.instructions),
      rawPath: '/instructions',
      value: raw.instructions,
      ...(source ? { source } : {}),
    })
  }

  if (Array.isArray(raw.tools)) {
    raw.tools.forEach((tool, index) => {
      const name = openAIToolName(tool) ?? String(index)
      segments.push({
        id: `tool:${name}:${index}`,
        kind: 'tool-definition',
        encoding: 'json',
        rawPath: `/tools/${index}`,
        value: tool,
        ...(source ? { source } : {}),
      })
    })
  }

  const messageField = Array.isArray(raw.messages) ? 'messages' : 'input'
  const messageInput = raw[messageField]
  if (Array.isArray(messageInput)) {
    messageInput.forEach((item, index) => {
      segments.push({
        id: `${messageField}:${index}`,
        kind: classifyItem(item),
        encoding: encodingFor(item),
        rawPath: `/${messageField}/${index}`,
        value: item,
        ...(source ? { source } : {}),
      })
    })
  } else if (messageInput !== undefined) {
    segments.push({
      id: messageField,
      kind: classifyItem(messageInput),
      encoding: encodingFor(messageInput),
      rawPath: `/${messageField}`,
      value: messageInput,
      ...(source ? { source } : {}),
    })
  }

  const model = typeof raw.model === 'string' ? raw.model : undefined
  return createContextRequest({
    id: options.id ?? 'openai-request',
    raw,
    segments,
    ...(model ? { target: { provider: 'openai', model } } : {}),
  })
}
