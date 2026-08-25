import {
  encodingForModel,
  getEncoding,
  type Tiktoken,
  type TiktokenEncoding,
  type TiktokenModel,
} from 'js-tiktoken'

import { type ContextTokenizer } from '../../domain/context/tokenizers.js'

export interface OpenAITokenizerOptions {
  /** Used when js-tiktoken does not recognize a newer model name. @default 'o200k_base' */
  readonly fallbackEncoding?: TiktokenEncoding
}

/**
 * OpenAI text tokenizer backed by js-tiktoken. Accuracy is `high` rather than
 * `exact` because provider-side message and tool serialization is not reproduced.
 */
export class OpenAITokenizer implements ContextTokenizer {
  public readonly id = 'openai-js-tiktoken'
  public readonly priority = 100
  public readonly accuracy = 'high' as const
  private readonly fallbackEncoding: TiktokenEncoding
  private readonly encoders = new Map<string, Tiktoken>()

  constructor(options: OpenAITokenizerOptions = {}) {
    this.fallbackEncoding = options.fallbackEncoding ?? 'o200k_base'
  }

  public supports(target: { provider: string }): boolean {
    return target.provider.toLowerCase() === 'openai'
  }

  public count(text: string, target: { model: string }): number {
    return this.encoder(target.model).encode(text).length
  }

  private encoder(model: string): Tiktoken {
    const existing = this.encoders.get(model)
    if (existing) return existing

    let encoder: Tiktoken
    try {
      encoder = encodingForModel(model as TiktokenModel)
    } catch {
      encoder = getEncoding(this.fallbackEncoding)
    }
    this.encoders.set(model, encoder)
    return encoder
  }
}
