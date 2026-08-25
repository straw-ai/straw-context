import { promises as fs } from 'fs'
import { pathToFileURL } from 'url'

import {
  adaptAnthropicRequest,
  adaptOpenAIRequest,
  adaptMessageRequest,
  createContextBaseline,
  createContextManifest,
  diffContextManifest,
  evaluateContextContract,
  ExactDuplicationAnalyzer,
  OpenAITokenizer,
  parseContextBaseline,
  parseContextContract,
  renderContextContractResult,
  renderContextDiff,
  renderContextManifest,
  SensitiveDataAnalyzer,
  TokenCompositionAnalyzer,
  TokenizerRegistry,
  ToolSchemaAnalyzer,
  type ContextBaseline,
  type ContextManifest,
} from '@straw-ai/sdk'

const usage = `Usage:
  straw inspect <request.json> [--adapter openai|anthropic|message] [--json]
  straw baseline <request.json> --output <baseline.json> [--adapter openai|anthropic|message]
  straw diff <baseline.json> <request.json> [--adapter openai|anthropic|message] [--json]
  straw test <request.json> --contract <contract.json> [--baseline <baseline.json>] [--adapter openai|anthropic|message] [--json]

Adapters: openai (default) supports Responses and Chat Completions; anthropic supports
Messages; message supports the provider-neutral { provider, model, system, tools, messages } shape.`

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(path, 'utf8')) as unknown
}

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must contain a JSON object.`)
  }
}

function approximateTokenizers(): TokenizerRegistry {
  return new TokenizerRegistry().register(new OpenAITokenizer()).register({
    id: 'approx-characters-v1',
    priority: -100,
    accuracy: 'estimated',
    supports: () => true,
    count: (text: string) => Math.ceil(text.length / 4),
  })
}

async function inspect(
  path: string,
  sensitiveData: ConstructorParameters<typeof SensitiveDataAnalyzer>[0] = {},
  adapter: string | undefined = 'openai',
): Promise<ContextManifest> {
  const raw = await readJson(path)
  assertObject(raw, path)
  if (adapter !== 'openai' && adapter !== 'anthropic' && adapter !== 'message') {
    throw new TypeError(`Unknown adapter: ${adapter}. Expected openai, anthropic, or message.`)
  }
  const request =
    adapter === 'message'
      ? adaptMessageRequest(raw, { id: path, source: path })
      : adapter === 'anthropic'
        ? adaptAnthropicRequest(raw, { id: path, source: path })
        : adaptOpenAIRequest(raw, { id: path, source: path })
  return createContextManifest(
    request,
    [
      new TokenCompositionAnalyzer(),
      new ExactDuplicationAnalyzer(),
      new ToolSchemaAnalyzer(),
      new SensitiveDataAnalyzer(sensitiveData),
    ],
    { tokenizers: approximateTokenizers() },
  )
}

export async function runCli(args: readonly string[]): Promise<number> {
  const [command, ...rest] = args
  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(`${usage}\n`)
    return 0
  }

  if (command === 'inspect') {
    const path = rest.find((argument) => !argument.startsWith('--'))
    if (!path) throw new TypeError('inspect requires a request JSON path.')
    const manifest = await inspect(path, {}, option(rest, '--adapter'))
    process.stdout.write(
      `${rest.includes('--json') ? JSON.stringify(manifest, null, 2) : renderContextManifest(manifest)}\n`,
    )
    return 0
  }

  if (command === 'baseline') {
    const path = rest.find((argument) => !argument.startsWith('--'))
    const output = option(rest, '--output')
    if (!path || !output) {
      throw new TypeError('baseline requires a request path and --output baseline path.')
    }
    const baseline = createContextBaseline(await inspect(path, {}, option(rest, '--adapter')))
    await fs.writeFile(output, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')
    process.stdout.write(`Baseline written to ${output}\n`)
    return 0
  }

  if (command === 'diff') {
    const paths = rest.filter((argument, index) => {
      if (argument.startsWith('--')) return false
      return index === 0 || rest[index - 1] !== '--output'
    })
    const [baselinePath, requestPath] = paths
    if (!baselinePath || !requestPath) {
      throw new TypeError('diff requires baseline and request JSON paths.')
    }
    const baseline = await readJson(baselinePath)
    assertObject(baseline, baselinePath)
    const diff = diffContextManifest(
      parseContextBaseline(baseline),
      await inspect(requestPath, {}, option(rest, '--adapter')),
    )
    process.stdout.write(
      `${rest.includes('--json') ? JSON.stringify(diff, null, 2) : renderContextDiff(diff)}\n`,
    )
    return 0
  }

  if (command === 'test') {
    const requestPath = rest[0]
    const contractPath = option(rest, '--contract')
    const baselinePath = option(rest, '--baseline')
    if (!requestPath || requestPath.startsWith('--') || !contractPath) {
      throw new TypeError('test requires a request path and --contract contract path.')
    }
    const contract = await readJson(contractPath)
    assertObject(contract, contractPath)
    let baseline: ContextBaseline | undefined
    if (baselinePath) {
      const value = await readJson(baselinePath)
      assertObject(value, baselinePath)
      baseline = parseContextBaseline(value)
    }
    const parsedContract = parseContextContract(contract)
    const result = evaluateContextContract(
      await inspect(requestPath, parsedContract.sensitiveData, option(rest, '--adapter')),
      parsedContract,
      baseline ? { baseline } : {},
    )
    process.stdout.write(
      `${rest.includes('--json') ? JSON.stringify(result, null, 2) : renderContextContractResult(result)}\n`,
    )
    return result.passed ? 0 : 1
  }

  throw new TypeError(`Unknown command: ${command}.\n\n${usage}`)
}

const entryPath = process.argv[1]
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      process.stderr.write(`straw: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    })
}
