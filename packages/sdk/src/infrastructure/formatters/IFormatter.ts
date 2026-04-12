/**
 * common interface for all formatting engines.
 */
export interface IFormatter {
  /**
   * Transforms the input node into a formatted string.
   * @param input The data to format.
   * @param options Formatting-specific options.
   */
  format(input: unknown, options?: any): string
}
