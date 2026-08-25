import { type ModelTarget } from './models.js'

export type TokenEstimateAccuracy = 'exact' | 'high' | 'estimated'

export interface TokenEstimate {
  readonly tokens: number
  readonly tokenizer: string
  readonly accuracy: TokenEstimateAccuracy
}

export interface ContextTokenizer {
  /** Stable identifier shown in reports and manifests. */
  readonly id: string
  /** Higher-priority tokenizers are selected first. @default 0 */
  readonly priority?: number
  /** Declares whether this tokenizer can count the requested provider/model pair. */
  supports(target: ModelTarget): boolean
  /** Counts a serialized text input. Provider-backed implementations may be asynchronous. */
  count(text: string, target: ModelTarget): number | Promise<number>
  /** Accuracy of counts produced by this tokenizer. @default 'estimated' */
  readonly accuracy?: TokenEstimateAccuracy
}

export class TokenizerNotFoundError extends Error {
  constructor(target: ModelTarget) {
    super(`No tokenizer registered for ${target.provider}/${target.model}.`)
    this.name = 'TokenizerNotFoundError'
  }
}

/** Registry for built-in and user-provided model tokenizers. */
export class TokenizerRegistry {
  private readonly tokenizers = new Map<string, ContextTokenizer>()

  public register(tokenizer: ContextTokenizer, options: { replace?: boolean } = {}): this {
    if (!tokenizer.id.trim()) {
      throw new TypeError('Tokenizer id must not be empty.')
    }
    if (this.tokenizers.has(tokenizer.id) && options.replace !== true) {
      throw new TypeError(`Tokenizer "${tokenizer.id}" is already registered.`)
    }

    this.tokenizers.set(tokenizer.id, tokenizer)
    return this
  }

  public unregister(id: string): boolean {
    return this.tokenizers.delete(id)
  }

  public resolve(target: ModelTarget): ContextTokenizer | undefined {
    return [...this.tokenizers.values()]
      .filter((tokenizer) => tokenizer.supports(target))
      .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))[0]
  }

  public async count(text: string, target: ModelTarget): Promise<TokenEstimate> {
    const tokenizer = this.resolve(target)
    if (!tokenizer) {
      throw new TokenizerNotFoundError(target)
    }

    const tokens = await tokenizer.count(text, target)
    if (!Number.isSafeInteger(tokens) || tokens < 0) {
      throw new TypeError(`Tokenizer "${tokenizer.id}" returned an invalid token count.`)
    }

    return {
      tokens,
      tokenizer: tokenizer.id,
      accuracy: tokenizer.accuracy ?? 'estimated',
    }
  }
}
