import yaml from 'js-yaml'

import { type IFormatter } from './IFormatter.js'

export class YAMLFormatter implements IFormatter {
  public format(input: unknown): string {
    try {
      return yaml.dump(input, {
        indent: 2,
        lineWidth: -1, // Don't wrap lines
        noRefs: true,
        sortKeys: true,
      })
    } catch (e) {
      return `[YAML Error: ${String(e)}]`
    }
  }
}
