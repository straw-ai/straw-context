import { promises as fs } from 'fs'
import { dirname, resolve } from 'path'
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
  type ContextContract,
  type ContextContractResult,
  type ContextManifest,
} from '@straw-ai/sdk'

type AdapterName = 'openai' | 'anthropic' | 'message'

interface ContextScenario {
  readonly name: string
  readonly request: string
  readonly adapter: AdapterName
  readonly contract: ContextContract
  readonly baseline?: string
}

interface ScenarioResult {
  readonly name: string
  readonly request: string
  readonly adapter: AdapterName
  readonly passed: boolean
  readonly result: ContextContractResult
}

const usage = `Usage:
  straw inspect <request.json> [--adapter openai|anthropic|message] [--json]
  straw baseline <request.json> --output <baseline.json> [--adapter openai|anthropic|message]
  straw diff <baseline.json> <request.json> [--adapter openai|anthropic|message] [--json]
  straw test <request.json> --contract <contract.json> [--baseline <baseline.json>] [--adapter openai|anthropic|message] [--json]
  straw check <scenarios.json> [--json]

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

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${path} must be a non-empty string.`)
  }
  return value
}

function adapterName(value: unknown, path: string): AdapterName {
  if (value === undefined) return 'openai'
  if (value === 'openai' || value === 'anthropic' || value === 'message') return value
  throw new TypeError(`${path} must be openai, anthropic, or message.`)
}

function parseScenarioSuite(value: unknown, suitePath: string): readonly ContextScenario[] {
  assertObject(value, suitePath)
  const unknownSuiteKey = Object.keys(value).find((key) => key !== 'scenarios')
  if (unknownSuiteKey) throw new TypeError(`${suitePath}.${unknownSuiteKey} is unknown.`)
  if (!Array.isArray(value.scenarios) || value.scenarios.length === 0) {
    throw new TypeError(`${suitePath}.scenarios must be a non-empty array.`)
  }
  const names = new Set<string>()
  return Object.freeze(
    value.scenarios.map((item, index) => {
      const path = `${suitePath}.scenarios[${index}]`
      assertObject(item, path)
      const unknownKey = Object.keys(item).find(
        (key) => !['name', 'request', 'adapter', 'contract', 'baseline'].includes(key),
      )
      if (unknownKey) throw new TypeError(`${path}.${unknownKey} is unknown.`)
      const name = requiredString(item.name, `${path}.name`)
      if (names.has(name)) throw new TypeError(`${path}.name duplicates scenario "${name}".`)
      names.add(name)
      assertObject(item.contract, `${path}.contract`)
      const contract = parseContextContract({ ...item.contract, name })
      return Object.freeze({
        name,
        request: requiredString(item.request, `${path}.request`),
        adapter: adapterName(item.adapter, `${path}.adapter`),
        contract,
        ...(item.baseline === undefined
          ? {}
          : { baseline: requiredString(item.baseline, `${path}.baseline`) }),
      })
    }),
  )
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

function renderScenarioResults(results: readonly ScenarioResult[]): string {
  const passed = results.filter((result) => result.passed).length
  const lines = [
    'Straw Scenario Check',
    '',
    `Result: ${passed === results.length ? 'PASS' : 'FAIL'} (${passed}/${results.length} passed)`,
  ]
  for (const scenario of results) {
    lines.push('', `${scenario.passed ? 'PASS' : 'FAIL'} ${scenario.name}`)
    for (const finding of scenario.result.findings) {
      const location = finding.location?.rawPath ? ` (${finding.location.rawPath})` : ''
      lines.push(`  ${finding.severity.toUpperCase()} ${finding.title}${location}`)
    }
  }
  return lines.join('\n')
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

  if (command === 'check') {
    const suitePath = rest[0]
    if (!suitePath || suitePath.startsWith('--')) {
      throw new TypeError('check requires a scenario suite JSON path.')
    }
    const suite = parseScenarioSuite(await readJson(suitePath), suitePath)
    const basePath = dirname(resolve(suitePath))
    const results: ScenarioResult[] = []
    for (const scenario of suite) {
      const requestPath = resolve(basePath, scenario.request)
      let baseline: ContextBaseline | undefined
      if (scenario.baseline) {
        const baselinePath = resolve(basePath, scenario.baseline)
        const value = await readJson(baselinePath)
        assertObject(value, baselinePath)
        baseline = parseContextBaseline(value)
      }
      const result = evaluateContextContract(
        await inspect(requestPath, scenario.contract.sensitiveData, scenario.adapter),
        scenario.contract,
        baseline ? { baseline } : {},
      )
      results.push({
        name: scenario.name,
        request: scenario.request,
        adapter: scenario.adapter,
        passed: result.passed,
        result,
      })
    }
    process.stdout.write(
      `${rest.includes('--json') ? JSON.stringify({ passed: results.every((item) => item.passed), scenarios: results }, null, 2) : renderScenarioResults(results)}\n`,
    )
    return results.every((result) => result.passed) ? 0 : 1
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
