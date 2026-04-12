/**
 * Custom error class for distillation errors.
 */
export class DistillError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DistillError'
  }
}
