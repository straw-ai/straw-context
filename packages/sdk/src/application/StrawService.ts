import { DistillError } from '../domain/distiller/errors.js'
import {
  type StrawOptions,
  type StrawResult,
  type StrawAnalysis,
  type TokenCounter,
} from '../domain/distiller/models.js'
import { AnalyticalFormatter } from './formatters/AnalyticalFormatter.js'
import { LeanFormatter } from './formatters/LeanFormatter.js'

export interface StrawConfig {
  /**
   * Global token counter function (e.g. using tiktoken).
   * Required for using the analyze() method.
   */
  tokenCounter?: TokenCounter
}

/**
 * Application Service for Straw.
 * The primary entry point for context minification.
 */
export class StrawService {
  private readonly tokenCounter?: TokenCounter

  constructor(config: StrawConfig = {}) {
    if (config.tokenCounter) {
      this.tokenCounter = config.tokenCounter
    }
  }

  /**
   * Lean transformation: Optimized for production speed.
   * Returns only the transformed context and reverse map.
   */
  public distill(input: object, options: StrawOptions = {}): StrawResult {
    this.validateInput(input)
    const formatter = new LeanFormatter(options)
    return formatter.format(input)
  }

  /**
   * Analytical transformation: Includes metrics, statistics, and logs.
   * Requires a tokenCounter to be provided either in the constructor or options.
   */
  public analyze(input: object, options: StrawOptions = {}): StrawAnalysis {
    this.validateInput(input)

    const counter = options.tokenCounter ?? this.tokenCounter
    if (!counter) {
      throw new DistillError(
        'StrawService.analyze() requires a tokenCounter. ' +
          'Pass it to the service constructor or the analyze() options.',
      )
    }

    const formatter = new AnalyticalFormatter(options, counter)
    return formatter.format(input)
  }

  private validateInput(input: unknown): void {
    if (input === null || typeof input !== 'object') {
      throw new DistillError(
        'Straw SDK strictly accepts structured data (Object or Array). ' +
          'Please parse your JSON strings before calling Straw methods.',
      )
    }
  }
}

/**
 * Functional export for lean distillation.
 */
export function distill(input: object, options: StrawOptions = {}): StrawResult {
  return new StrawService().distill(input, options)
}

/**
 * Functional export for analysis.
 */
export function analyze(input: object, options: StrawOptions = {}): StrawAnalysis {
  const config: StrawConfig = {}
  if (options.tokenCounter) {
    config.tokenCounter = options.tokenCounter
  }
  return new StrawService(config).analyze(input, options)
}
