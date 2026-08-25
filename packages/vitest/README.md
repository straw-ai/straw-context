# `@straw-ai/vitest`

Vitest assertions for assembled LLM context.

```ts
import { adaptOpenAIRequest } from '@straw-ai/sdk'
import '@straw-ai/vitest'

it('keeps the read-only support context safe and bounded', async () => {
  const request = adaptOpenAIRequest(buildSupportRequest())

  await expect(request).toMatchContextContract({
    name: 'support-read-only',
    tokens: { maxComponentTokens: 12000 },
    tools: { required: ['search'], forbidden: ['delete_account'] },
    sensitiveData: { forbiddenPaths: ['**.ssn'] },
  })
})
```

Pass a `baseline` in the optional second matcher-options argument for regression and structural assertions. Custom analyzer and tokenizer registries are also supported.
