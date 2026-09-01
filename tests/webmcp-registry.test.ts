import { describe, expect, it } from 'vitest'

import { InWritingEngine } from '../src/case/in-writing-engine'
import {
  DynamicWebMcpRegistry,
  type WebMcpTool,
} from '../src/webmcp/dynamic-registry'

describe('DynamicWebMcpRegistry', () => {
  it('replaces rather than accumulates the live tool set at every state change', async () => {
    const live = new Map<string, WebMcpTool>()
    const counts: number[] = []
    const context = {
      async registerTool(tool: WebMcpTool, options: { signal: AbortSignal }) {
        live.set(tool.name, tool)
        options.signal.addEventListener('abort', () => live.delete(tool.name), { once: true })
        counts.push(live.size)
      },
    }
    const engine = new InWritingEngine()
    const registry = new DynamicWebMcpRegistry(engine, context)

    await registry.start()
    expect([...live.keys()].sort()).toEqual(engine.activeToolNames())
    engine.bindLiveTrack()
    await registry.settled()
    expect([...live.keys()].sort()).toEqual(engine.activeToolNames())
    engine.recordSignal('good-faith-payment', 8.01, 0.94)
    await registry.settled()
    expect([...live.keys()].sort()).toEqual(engine.activeToolNames())
    expect(Math.max(...counts)).toBeLessThanOrEqual(6)

    const danger = live.get('danger')!
    const result = await danger.execute({ act: 'make-good-faith-payment' }, {})
    expect(result).toMatchObject({ legalStatus: 'not-determined' })
    await registry.settled()
    expect(live.has('check_statement')).toBe(false)
    expect(live.has('prepare_validation_facts')).toBe(true)
  })

  it('publishes closed schemas and propagates AbortError without mutating state', async () => {
    const registered: WebMcpTool[] = []
    const engine = new InWritingEngine()
    const registry = new DynamicWebMcpRegistry(engine, {
      async registerTool(tool) {
        registered.push(tool)
      },
    })
    await registry.start()
    const start = registered.find((tool) => tool.name === 'start_listening')!
    expect(start.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
    })
    const signal = AbortSignal.abort()
    await expect(start.execute({}, { signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(engine.state).toBe('ready')
  })

  it('fails closed when the native API is missing', async () => {
    const registry = new DynamicWebMcpRegistry(new InWritingEngine(), null)
    await expect(registry.start()).rejects.toThrow('document.modelContext is unavailable')
  })
})
