import {
  createContextRequest,
  type ContextEncoding,
  type ContextRequest,
  type ContextSegment,
  type ContextSegmentKind,
} from '../../domain/context/models.js'

export interface AnthropicRequestAdapterOptions {
  readonly id?: string
  readonly source?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function encodingFor(value: unknown): ContextEncoding {
  return typeof value === 'string' ? 'text' : 'json'
}

function toolName(value: unknown): string | undefined {
  return isRecord(value) && typeof value.name === 'string' ? value.name : undefined
}

function blockKind(value: unknown): ContextSegmentKind {
  return isRecord(value) && value.type === 'tool_result' ? 'tool-result' : 'message'
}

/** Annotates Anthropic Messages requests, splitting array content into precise block paths. */
export function adaptAnthropicRequest(
  raw: Record<string, unknown>,
  options: AnthropicRequestAdapterOptions = {},
): ContextRequest {
  const segments: ContextSegment[] = []
  const source = options.source
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
    raw.messages.forEach((message, messageIndex) => {
      if (isRecord(message) && Array.isArray(message.content)) {
        message.content.forEach((block, blockIndex) => {
          add(
            `messages:${messageIndex}:content:${blockIndex}`,
            blockKind(block),
            `/messages/${messageIndex}/content/${blockIndex}`,
            block,
          )
        })
      } else {
        add(`messages:${messageIndex}`, 'message', `/messages/${messageIndex}`, message)
      }
    })
  }

  const model = typeof raw.model === 'string' && raw.model.trim() ? raw.model : undefined
  return createContextRequest({
    id: options.id ?? 'anthropic-request',
    raw,
    segments,
    ...(model ? { target: { provider: 'anthropic', model } } : {}),
  })
}
