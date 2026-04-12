import { type AliaserRule } from '../entities.js'

export const uuidAliaser: AliaserRule = {
  name: 'uuid',
  pattern: /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/gi,
  prefix: 'UUID',
} as const

export const shaAliaser: AliaserRule = {
  name: 'sha',
  pattern: /\b[a-f0-9]{32,128}\b/gi,
  prefix: 'SHA',
} as const
