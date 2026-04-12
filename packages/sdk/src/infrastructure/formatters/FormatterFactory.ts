import { type OutputFormat } from '../../domain/distiller/models.js'
import { DMDFormatter } from './DMDFormatter.js'
import { type IFormatter } from './IFormatter.js'
import { JSONFormatter } from './JSONFormatter.js'
import { TOONFormatter } from './TOONFormatter.js'
import { XMLFormatter } from './XMLFormatter.js'
import { YAMLFormatter } from './YAMLFormatter.js'

export class FormatterFactory {
  private formatters: Map<OutputFormat, IFormatter> = new Map<OutputFormat, IFormatter>([
    ['dmd', new DMDFormatter()],
    ['json', new JSONFormatter()],
    ['toon', new TOONFormatter()],
    ['xml', new XMLFormatter()],
    ['yaml', new YAMLFormatter()],
  ])

  public getFormatter(format: OutputFormat): IFormatter {
    const formatter = this.formatters.get(format)
    if (!formatter) {
      // Default to DMD
      return this.formatters.get('dmd')!
    }
    return formatter
  }
}
