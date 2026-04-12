import { type IFormatter } from './IFormatter.js'

export class JSONFormatter implements IFormatter {
  public format(input: unknown): string {
    return JSON.stringify(input, null, 2)
  }
}
