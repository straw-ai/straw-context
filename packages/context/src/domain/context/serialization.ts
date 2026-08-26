import { type ContextSegment } from './models.js'

/** Deterministic default serialization used for component-level analysis. */
export function serializeContextSegment(segment: ContextSegment): string {
  if (typeof segment.value === 'string') return segment.value
  const serialized = JSON.stringify(segment.value)
  return serialized ?? String(segment.value)
}
