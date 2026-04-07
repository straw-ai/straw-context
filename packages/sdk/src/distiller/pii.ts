import type { RedactorRule } from './types.js'

export const emailRedactor: RedactorRule = {
  name: 'email',
  pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi,
  prefix: 'EMAIL',
} as const

export const phoneRedactor: RedactorRule = {
  name: 'phone',
  pattern: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  prefix: 'PHONE',
} as const

export const creditCardRedactor: RedactorRule = {
  name: 'credit-card',
  pattern: /\b(?:\d{4}[ -]?){3}\d{4}\b|\b3[47]\d{2}[ -]?\d{6}[ -]?\d{5}\b/g,
  prefix: 'CREDIT_CARD',
} as const

export const apiKeyRedactor: RedactorRule = {
  name: 'api-key',
  pattern:
    /\b(?:sk-[a-zA-Z0-9]{48}|sk_(?:test|live)_[a-zA-Z0-9]{24}|xox[baprs]-[0-9a-zA-Z]{10,48}|gh[pousr]_[a-zA-Z0-9]{36})\b/g,
  prefix: 'API_KEY',
} as const

export const defaultRedactors: RedactorRule[] = [
  emailRedactor,
  phoneRedactor,
  creditCardRedactor,
  apiKeyRedactor,
]

/**
 * Redacts PII/PHI from a string based on programmatic rules.
 */
export function redactString(
  text: string,
  activeRedactors: RedactorRule[],
  forwardMap: Map<string, string>,
  reverseMap: Map<string, string>,
  counters: Map<string, number>,
  path: string,
  onRedact?: (type: string, value: string, path: string) => void,
): string {
  let result = text

  for (const rule of activeRedactors) {
    result = result.replace(rule.pattern, (match) => {
      if (onRedact) {
        onRedact(rule.name, match, path)
      }

      if (forwardMap.has(match)) {
        return forwardMap.get(match)!
      }

      const count = counters.get(rule.prefix) || 0
      const token = `<${rule.prefix}_${count}>`
      counters.set(rule.prefix, count + 1)

      forwardMap.set(match, token)
      reverseMap.set(token, match)

      return token
    })
  }

  return result
}
