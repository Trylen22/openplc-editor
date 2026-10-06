/** @jest-environment node */
import { runRungAgentChat } from '../rung-agent'

const request = {
  pouName: 'Main',
  source: 'Motor := Start;',
  variables: [],
  messages: [{ role: 'user' as const, content: 'Add an interlock' }],
}
const originalEnv = { ...process.env }
const originalFetch = global.fetch

afterEach(() => {
  process.env = { ...originalEnv }
  global.fetch = originalFetch
})

it('reports a missing key without making an API request', async () => {
  delete process.env.XAI_API_KEY
  delete process.env.GROK_API_KEY
  process.env.RUNG_API_KEY_FILE = '/nonexistent/rung-agent-test-key'
  const fetchMock = jest.fn()
  global.fetch = fetchMock
  expect(await runRungAgentChat(request)).toMatchObject({ ok: false })
  expect(fetchMock).not.toHaveBeenCalled()
})

it('applies tool edits and returns new POU variables', async () => {
  process.env.XAI_API_KEY = 'test-key'
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: '1',
                  type: 'function',
                  function: {
                    name: 'create_variable',
                    arguments: JSON.stringify({ name: 'Stop', type: 'BOOL', class: 'input' }),
                  },
                },
                {
                  id: '2',
                  type: 'function',
                  function: {
                    name: 'replace_in_source',
                    arguments: JSON.stringify({
                      old_string: 'Motor := Start;',
                      new_string: 'Motor := Start AND NOT Stop;',
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Added the interlock.' } }] }),
    })
  global.fetch = fetchMock
  expect(await runRungAgentChat(request)).toEqual({
    ok: true,
    text: 'Added the interlock.',
    source: 'Motor := Start AND NOT Stop;',
    didEdit: true,
    variables: [{ name: 'Stop', type: 'BOOL', class: 'input' }],
  })
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('returns provider errors without returning edits', async () => {
  process.env.XAI_API_KEY = 'test-key'
  global.fetch = jest
    .fn()
    .mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: { message: 'Invalid API key' } }) })
  expect(await runRungAgentChat(request)).toEqual({ ok: false, error: 'Invalid API key' })
})
