interface OllamaResponse {
  response: string
  logprobs?: { token: string; logprob: number }[]
  // Fallback field in some Ollama versions
  prompt_eval_logprobs?: { token: string; logprob: number }[]
}

async function getLogprobs(
  text: string,
  model = 'llama3.2',
  ollamaUrl = 'http://localhost:11434',
): Promise<number[]> {
  const res = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: text,
      stream: false,
      options: { temperature: 0 },
      logprobs: true, // request logprobs
    }),
  })

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`)

  const data: OllamaResponse = await res.json()

  // Improved extraction with fallback
  const logprobs = data.logprobs ?? data.prompt_eval_logprobs

  if (!logprobs?.length) {
    throw new Error('No logprobs returned — check your Ollama version (needs >= 0.3.0)')
  }

  return logprobs.map((lp) => lp.logprob)
}

export function calcPerplexity(logprobs: number[]): number {
  const meanNegLogprob = -logprobs.reduce((a, b) => a + b, 0) / logprobs.length
  return Math.exp(meanNegLogprob)
}

export async function measurePerplexity(
  text: string,
  model = 'llama3.2',
): Promise<{ ppl: number; tokenCount: number }> {
  const logprobs = await getLogprobs(text, model)
  return {
    ppl: calcPerplexity(logprobs),
    tokenCount: logprobs.length,
  }
}
