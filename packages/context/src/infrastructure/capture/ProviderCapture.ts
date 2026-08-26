import { type ContextRequest } from '../../domain/context/models.js'
import { adaptAnthropicRequest } from '../adapters/AnthropicRequestAdapter.js'
import { adaptOpenAIRequest } from '../adapters/OpenAIRequestAdapter.js'

export interface CapturedRequest {
  readonly provider: 'openai' | 'anthropic'
  readonly operation: 'responses.create' | 'chat.completions.create' | 'messages.create'
  readonly request: ContextRequest
}

export type RequestCaptureHandler = (capture: CapturedRequest) => void | Promise<void>

export interface CaptureClientOptions {
  readonly onCapture: RequestCaptureHandler
  readonly source?: string
}

function requestObject(value: unknown, operation: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${operation} requires a request object as its first argument.`)
  }
  return value as Record<string, unknown>
}

function captureMethod(
  target: object,
  method: string,
  operation: CapturedRequest['operation'],
  capture: (raw: Record<string, unknown>) => CapturedRequest,
  handler: RequestCaptureHandler,
): object {
  return new Proxy(target, {
    get(current, property) {
      const value = Reflect.get(current, property, current) as unknown
      if (property !== method || typeof value !== 'function') {
        return typeof value === 'function' ? value.bind(current) : value
      }
      return async (...args: unknown[]) => {
        const raw = requestObject(args[0], operation)
        await handler(capture(raw))
        return Reflect.apply(value, current, args) as unknown
      }
    },
  })
}

function namespace(target: unknown, path: string): object {
  if (typeof target !== 'object' || target === null) {
    throw new TypeError(`Client does not expose ${path}.`)
  }
  return target
}

/** Captures OpenAI Responses and Chat Completions payloads before forwarding calls. */
export function captureOpenAIClient<T extends object>(client: T, options: CaptureClientOptions): T {
  return new Proxy(client, {
    get(target, property) {
      const value = Reflect.get(target, property, target) as unknown
      if (property === 'responses') {
        return captureMethod(
          namespace(value, 'responses'),
          'create',
          'responses.create',
          (raw) => ({
            provider: 'openai',
            operation: 'responses.create',
            request: adaptOpenAIRequest(raw, {
              id: 'openai.responses.create',
              ...(options.source ? { source: options.source } : {}),
            }),
          }),
          options.onCapture,
        )
      }
      if (property === 'chat') {
        const chat = namespace(value, 'chat')
        return new Proxy(chat, {
          get(chatTarget, chatProperty) {
            const chatValue = Reflect.get(chatTarget, chatProperty, chatTarget) as unknown
            if (chatProperty !== 'completions') {
              return typeof chatValue === 'function' ? chatValue.bind(chatTarget) : chatValue
            }
            return captureMethod(
              namespace(chatValue, 'chat.completions'),
              'create',
              'chat.completions.create',
              (raw) => ({
                provider: 'openai',
                operation: 'chat.completions.create',
                request: adaptOpenAIRequest(raw, {
                  id: 'openai.chat.completions.create',
                  ...(options.source ? { source: options.source } : {}),
                }),
              }),
              options.onCapture,
            )
          },
        })
      }
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/** Captures Anthropic Messages payloads before forwarding calls. */
export function captureAnthropicClient<T extends object>(
  client: T,
  options: CaptureClientOptions,
): T {
  return new Proxy(client, {
    get(target, property) {
      const value = Reflect.get(target, property, target) as unknown
      if (property !== 'messages') return typeof value === 'function' ? value.bind(target) : value
      return captureMethod(
        namespace(value, 'messages'),
        'create',
        'messages.create',
        (raw) => ({
          provider: 'anthropic',
          operation: 'messages.create',
          request: adaptAnthropicRequest(raw, {
            id: 'anthropic.messages.create',
            ...(options.source ? { source: options.source } : {}),
          }),
        }),
        options.onCapture,
      )
    },
  })
}
