/**
 * Core Rule for the Aliaser Engine.
 * Replaces high-entropy strings (IDs, Hashes) with short, stable tokens.
 */
export interface AliaserRule {
  /** Descriptive name of the aliaser (e.g. 'uuid') */
  readonly name: string
  /** The pattern to find in strings */
  readonly pattern: RegExp
  /** The prefix for generated tokens (e.g. 'UUID' becomes $UUID_0) */
  readonly prefix: string
}
