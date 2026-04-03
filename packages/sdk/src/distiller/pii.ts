import type { PIIType, RedactOptions } from './types.js'

const BUILT_IN_PATTERNS: Record<PIIType, RegExp> = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  // Naive but robust enough phone number capture for standard formats
  phone: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  // 16-digit (VISA/MC) and 15-digit (AMEX)
  'credit-card': /\b(?:\d{4}[ -]?){3}\d{4}\b|\b3[47]\d{2}[ -]?\d{6}[ -]?\d{5}\b/g,
  // Common vendor API tokens
  'api-key':
    /\b(?:sk-[a-zA-Z0-9]{48}|sk_(?:test|live)_[a-zA-Z0-9]{24}|xox[baprs]-[0-9a-zA-Z]{10,48}|gh[pousr]_[a-zA-Z0-9]{36})\b/g,
}

const DEFAULT_TYPES: PIIType[] = ['api-key', 'credit-card', 'email', 'phone']

/**
 * Redacts PII/PHI from a string based on the provided options.
 */
const compiledRulesCache = new WeakMap<RedactOptions, { pattern: RegExp; base: string }[]>()

export function redactString(
  text: string,
  options: RedactOptions,
  forwardMap: Map<string, string>,
  reverseMap: Map<string, string>,
  counters: Record<string, number>,
  path: string,
): string {
  if (!options) {
    return text
  }

  const opt = options
  const activeTypes = opt.types ?? DEFAULT_TYPES
  const customRules = opt.customRules ?? []

  let compiledCustomRules = compiledRulesCache.get(opt)
  if (!compiledCustomRules) {
    compiledCustomRules = customRules.map((rule) => {
      let base = rule.replacement
        .replace(/^</, '')
        .replace(/>$/, '')
        .toUpperCase()
        .replace(/\s+/g, '_')
      if (!base) base = 'REDACTED'
      const flags = rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g'
      return { pattern: new RegExp(rule.pattern.source, flags), base }
    })
    compiledRulesCache.set(opt, compiledCustomRules)
  }

  let result = text

  const applyRule = (pattern: RegExp, replacementBase: string) => {
    result = result.replace(pattern, (match) => {
      // Trigger audit callback
      if (opt.onRedact) {
        opt.onRedact(replacementBase, match, path)
      }

      if (forwardMap.has(match)) return forwardMap.get(match)!

      const count = counters[replacementBase] ?? 0
      counters[replacementBase] = count + 1

      const token = `<${replacementBase}_${count}>`
      forwardMap.set(match, token)
      reverseMap.set(token, match)
      return token
    })
  }

  // 1. Apply Built-in Redactions
  for (const type of activeTypes) {
    const pattern = BUILT_IN_PATTERNS[type]
    if (pattern) {
      applyRule(pattern, type.toUpperCase().replace('-', '_'))
    }
  }

  // 2. Apply Custom Redactions
  for (const rule of compiledCustomRules) {
    applyRule(rule.pattern, rule.base)
  }

  return result
}
