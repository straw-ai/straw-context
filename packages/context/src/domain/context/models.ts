/** A provider/model pair used when analysis depends on model-specific behavior. */
export interface ModelTarget {
  readonly provider: string
  readonly model: string
}

export type ContextSegmentKind =
  | 'instruction'
  | 'tool-definition'
  | 'message'
  | 'tool-result'
  | 'retrieval'
  | 'memory'
  | 'attachment'
  | 'unknown'

export type ContextEncoding = 'text' | 'json' | 'multimodal' | 'unknown'

/**
 * An annotated view over one meaningful part of a provider request.
 * `rawPath` is a JSON Pointer into the untouched request.
 */
export interface ContextSegment {
  readonly id: string
  readonly kind: ContextSegmentKind
  readonly encoding: ContextEncoding
  readonly rawPath: string
  readonly value: unknown
  readonly source?: string
}

/**
 * Provider-agnostic analysis input. The raw request remains the source of truth;
 * adapters only add segment views and must not rewrite it.
 */
export interface ContextRequest {
  readonly id: string
  readonly raw: unknown
  readonly segments: readonly ContextSegment[]
  readonly target?: ModelTarget
}

export interface CreateContextRequestInput {
  readonly id: string
  readonly raw: unknown
  readonly segments: readonly ContextSegment[]
  readonly target?: ModelTarget
}

/** Creates an immutable request view while preserving the original raw payload. */
export function createContextRequest(input: CreateContextRequestInput): ContextRequest {
  if (!input.id.trim()) {
    throw new TypeError('Context request id must not be empty.')
  }

  const ids = new Set<string>()
  const segments = input.segments.map((segment) => {
    if (!segment.id.trim()) {
      throw new TypeError('Context segment id must not be empty.')
    }
    if (ids.has(segment.id)) {
      throw new TypeError(`Duplicate context segment id: "${segment.id}".`)
    }
    ids.add(segment.id)
    return Object.freeze({ ...segment })
  })

  const request: ContextRequest = {
    id: input.id,
    raw: input.raw,
    segments: Object.freeze(segments),
    ...(input.target ? { target: Object.freeze({ ...input.target }) } : {}),
  }

  return Object.freeze(request)
}
