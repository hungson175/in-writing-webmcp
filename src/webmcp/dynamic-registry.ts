import { InWritingEngine } from '../case/in-writing-engine'

export interface WebMcpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: { readOnlyHint: boolean }
  execute(
    input?: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<unknown>
}

export interface ModelContextLike {
  registerTool(tool: WebMcpTool, options: { signal: AbortSignal }): Promise<void>
}

function aborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Tool call aborted', 'AbortError')
}

function emptySchema(): Record<string, unknown> {
  return { type: 'object', properties: {}, additionalProperties: false }
}

function requiredString(name: string, values?: string[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      [name]: values
        ? { type: 'string', enum: values }
        : { type: 'string', minLength: 1 },
    },
    required: [name],
    additionalProperties: false,
  }
}

function requiredCursor(): Record<string, unknown> {
  return {
    type: 'object',
    properties: { cursor: { type: 'integer', minimum: 0 } },
    required: ['cursor'],
    additionalProperties: false,
  }
}

export class DynamicWebMcpRegistry {
  private controller: AbortController | null = null
  private queue: Promise<void> = Promise.resolve()
  private unsubscribe: (() => void) | null = null

  constructor(
    private readonly engine: InWritingEngine,
    private readonly context: ModelContextLike | null,
    private readonly onLiveNames: (names: string[]) => void = () => undefined,
  ) {}

  async start(): Promise<void> {
    if (!this.context) throw new Error('document.modelContext is unavailable')
    this.unsubscribe = this.engine.subscribe(() => this.scheduleSync())
    this.scheduleSync()
    await this.queue
  }

  async settled(): Promise<void> {
    await this.queue
  }

  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.controller?.abort()
    this.controller = null
    this.onLiveNames([])
  }

  private scheduleSync(): void {
    this.queue = this.queue.then(() => this.sync())
  }

  private async sync(): Promise<void> {
    if (!this.context) return
    this.controller?.abort()
    const controller = new AbortController()
    this.controller = controller
    const names = this.engine.activeToolNames()
    if (names.length > 6) throw new Error('WebMCP live-tool cap exceeded')
    for (const name of names) {
      await this.context.registerTool(this.tool(name), { signal: controller.signal })
    }
    this.onLiveNames(names)
  }

  private tool(name: string): WebMcpTool {
    const definition = this.definition(name)
    return {
      ...definition,
      async execute(input = {}, options = {}) {
        aborted(options.signal)
        return definition.run(input)
      },
    }
  }

  private definition(name: string): Omit<WebMcpTool, 'execute'> & {
    run(input: Record<string, unknown>): unknown
  } {
    switch (name) {
      case 'start_listening':
        return {
          name,
          description: 'Confirm the live synthetic audio track captured by the page after the human presses Play.',
          inputSchema: emptySchema(),
          annotations: { readOnlyHint: false },
          run: () => this.engine.startListening(),
        }
      case 'case_clock':
        return {
          name,
          description: 'Return the demonstration validation-window arithmetic from the sample notice receipt date.',
          inputSchema: emptySchema(),
          annotations: { readOnlyHint: true },
          run: () => this.engine.caseClock(),
        }
      case 'case_history':
        return {
          name,
          description: 'Return dated sample-file history without determining the legal status of a debt.',
          inputSchema: emptySchema(),
          annotations: { readOnlyHint: true },
          run: () => this.engine.caseHistory(),
        }
      case 'recording_boundary':
        return {
          name,
          description: 'Return the synthetic-audio, consent and page-memory boundaries of this demonstration.',
          inputSchema: emptySchema(),
          annotations: { readOnlyHint: true },
          run: () => this.engine.recordingBoundary(),
        }
      case 'get_transcript_since':
        return {
          name,
          description: 'Return only closed-vocabulary acoustic signals after a cursor; no full transcript exists or is stored.',
          inputSchema: requiredCursor(),
          annotations: { readOnlyHint: true },
          run: (input) => this.engine.getSignalSince(Number(input.cursor)),
        }
      case 'check_statement':
        return {
          name,
          description: 'Classify one detected live signal against the cited FTC source without giving advice.',
          inputSchema: requiredString('signalId', ['signal-1']),
          annotations: { readOnlyHint: true },
          run: (input) => this.engine.checkStatement(String(input.signalId)),
        }
      case 'danger':
        return {
          name,
          description: 'Pair a detected payment ask with dated sample-file facts and the limited FTC some-states consequence.',
          inputSchema: requiredString('act', ['make-good-faith-payment']),
          annotations: { readOnlyHint: true },
          run: (input) => this.engine.danger(String(input.act)),
        }
      case 'explain_source':
        return {
          name,
          description: 'Return the official source and bounded fact for one cited rule.',
          inputSchema: requiredString('sourceId', ['ftc-time-barred-debt', 'usc-1692g']),
          annotations: { readOnlyHint: true },
          run: (input) => this.engine.explainSource(String(input.sourceId)),
        }
      case 'prepare_validation_facts':
        return {
          name,
          description: 'Prepare dated validation-window facts for the human; transmit nothing.',
          inputSchema: emptySchema(),
          annotations: { readOnlyHint: true },
          run: () => this.engine.prepareValidationFacts(),
        }
      case 'stop_listening':
        return {
          name,
          description: 'Release the page-held live track and close the synthetic listening session.',
          inputSchema: emptySchema(),
          annotations: { readOnlyHint: false },
          run: () => this.engine.stopListening(),
        }
      default:
        throw new Error(`Unknown tool ${name}`)
    }
  }
}
