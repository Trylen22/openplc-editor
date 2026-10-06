import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

/**
 * LOCAL SKETCH: Grok can read and edit the ST in the OpenPLC pane.
 * The API key stays in the main process.
 */

const XAI_CHAT_URL = 'https://api.x.ai/v1/chat/completions'
const DEFAULT_MODEL = 'grok-4.6'
const MAX_TURNS = 8

export interface RungAgentChatMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

export interface RungAgentVariable {
  readonly name: string
  readonly class: string
  readonly type: string
}

export interface RungAgentChatRequest {
  readonly messages: readonly RungAgentChatMessage[]
  readonly pouName: string
  readonly source: string
  readonly variables: readonly RungAgentVariable[]
}

export interface RungAgentChatSuccess {
  readonly ok: true
  readonly text: string
  readonly source: string
  readonly didEdit: boolean
  readonly variables: readonly RungAgentVariable[]
}

export type RungAgentChatResult = RungAgentChatSuccess | { readonly ok: false; readonly error: string }

type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

interface ToolCall {
  readonly id: string
  readonly type: 'function'
  readonly function: { readonly name: string; readonly arguments: string }
}

interface ApiMessage {
  role: ChatRole
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_source',
      description: 'Read the current Structured Text in the editor pane, with line numbers.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_variables',
      description:
        'List variables already declared in this POU table. OpenPLC will not compile names that are missing here.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'replace_in_source',
      description:
        'Edit the ST pane. old_string must match exactly once. Use this for surgical changes the way Cursor edits a file.',
      parameters: {
        type: 'object',
        properties: {
          old_string: { type: 'string' },
          new_string: { type: 'string' },
        },
        required: ['old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_source',
      description: 'Replace the entire ST pane. Use when rewriting the program, not for a small tweak.',
      parameters: {
        type: 'object',
        properties: { content: { type: 'string' } },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_variable',
      description:
        'Add a variable to the OpenPLC Variables table so the ST can compile. Call this before using a new name in the program.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', description: 'IEC type such as BOOL, INT, REAL, TIME' },
          class: {
            type: 'string',
            description: 'input, output, inOut, local, temp, or external',
          },
        },
        required: ['name', 'type'],
      },
    },
  },
] as const

function readApiKey(): string | undefined {
  for (const name of ['XAI_API_KEY', 'GROK_API_KEY'] as const) {
    const value = process.env[name]
    if (value !== undefined && value.trim() !== '') return value.trim()
  }
  try {
    const keyFile = process.env['RUNG_API_KEY_FILE']?.trim() || join(homedir(), 'Desktop', 'AGENTIC_PLC', 'api_key.txt')
    const fromFile = readFileSync(keyFile, 'utf8').trim()
    return fromFile === '' ? undefined : fromFile
  } catch {
    return undefined
  }
}

function asString(input: Record<string, unknown>, key: string): string {
  const value = input[key]
  return typeof value === 'string' ? value : ''
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw === '' ? '{}' : raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

class StSession {
  source: string
  variables: RungAgentVariable[]
  didEdit = false

  constructor(source: string, variables: readonly RungAgentVariable[]) {
    this.source = source
    this.variables = [...variables]
  }

  numberedSource(): string {
    const lines = this.source.split('\n')
    if (this.source === '') return '(empty editor pane)'
    return lines.map((line, index) => `${String(index + 1).padStart(4, ' ')} | ${line}`).join('\n')
  }

  run(name: string, input: Record<string, unknown>): string {
    switch (name) {
      case 'read_source':
        return this.numberedSource()
      case 'list_variables':
        if (this.variables.length === 0) return 'No variables in the table yet.'
        return this.variables.map((item) => `${item.name}: ${item.class} ${item.type}`).join('\n')
      case 'replace_in_source':
        return this.replace(asString(input, 'old_string'), asString(input, 'new_string'))
      case 'write_source':
        return this.write(asString(input, 'content'))
      case 'create_variable':
        return this.createVariable(asString(input, 'name'), asString(input, 'type'), asString(input, 'class'))
      default:
        return `There is no tool named "${name}".`
    }
  }

  private replace(oldString: string, newString: string): string {
    if (oldString === '') return 'old_string was empty. Copy the exact text from read_source.'
    const matches = this.source.split(oldString).length - 1
    if (matches === 0) return 'old_string was not found. Call read_source and copy the exact text, including spaces.'
    if (matches > 1) {
      return `old_string matched ${matches} times. Include more surrounding lines so it is unique.`
    }
    this.source = this.source.replace(oldString, newString)
    this.didEdit = true
    return `Updated the ST pane.\n\n${this.numberedSource()}`
  }

  private write(content: string): string {
    this.source = content
    this.didEdit = true
    return `Replaced the ST pane (${content.split('\n').length} lines).`
  }

  private createVariable(name: string, typeName: string, className: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return `Invalid variable name: ${name}`
    if (this.variables.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      return `${name} is already in the table.`
    }
    const allowed = new Set(['input', 'output', 'inOut', 'local', 'temp', 'external'])
    const klass = allowed.has(className) ? className : 'local'
    const iecType = typeName.trim() === '' ? 'BOOL' : typeName.trim().toUpperCase()
    this.variables.push({ name, class: klass, type: iecType })
    this.didEdit = true
    return `Added ${name} as ${klass} ${iecType} to the Variables table.`
  }
}

function systemPrompt(pouName: string, session: StSession): string {
  return [
    'You are a PLC pair-programmer inside a local OpenPLC + Rung dual-view sketch.',
    'The left pane is IEC Structured Text. The right pane is a live ladder sketch of a subset of that ST.',
    'You can edit the left pane the way Cursor edits a file. Use tools. Do not only describe the new program.',
    'After an edit, the user must see the ST change. Prefer replace_in_source for small changes and write_source for a rewrite.',
    'If you introduce a new name, call create_variable first. OpenPLC stores variables in a table, not in VAR...END_VAR in the body.',
    'Write IEC ST: :=  AND  OR  NOT  IF ... THEN ... END_IF;  SET/RST as Coil := TRUE/FALSE when needed.',
    'Be brief in chat. The code pane is the answer.',
    '',
    `Current POU: ${pouName}`,
    'Current variables:',
    session.variables.length === 0
      ? '(none)'
      : session.variables.map((item) => `- ${item.name}: ${item.class} ${item.type}`).join('\n'),
    'Current ST:',
    session.source === '' ? '(empty)' : session.source,
  ].join('\n')
}

function fenceFallback(text: string, current: string): string | undefined {
  const match = /```(?:st|iecst|structuredtext|iec)?\s*\n([\s\S]*?)```/i.exec(text)
  if (match === null) return undefined
  const next = match[1]?.trim() ?? ''
  if (next === '' || next === current.trim()) return undefined
  if (!/[:=]|IF\b|AND\b|;/i.test(next)) return undefined
  return match[1] ?? next
}

async function complete(apiKey: string, messages: ApiMessage[]): Promise<{ message: ApiMessage; error?: string }> {
  const response = await fetch(XAI_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env['XAI_MODEL']?.trim() || DEFAULT_MODEL,
      messages,
      tools: TOOLS,
      temperature: 0.2,
    }),
  })

  const payload = (await response.json()) as {
    choices?: { message?: ApiMessage }[]
    error?: { message?: string }
  }

  if (!response.ok) {
    return {
      message: { role: 'assistant', content: '' },
      error: payload.error?.message ?? `Grok request failed (${response.status})`,
    }
  }

  const message = payload.choices?.[0]?.message
  if (message === undefined) {
    return { message: { role: 'assistant', content: '' }, error: 'Grok returned an empty message.' }
  }
  return { message }
}

export async function runRungAgentChat(request: RungAgentChatRequest): Promise<RungAgentChatResult> {
  const apiKey = readApiKey()
  if (apiKey === undefined) {
    return {
      ok: false,
      error:
        'Set XAI_API_KEY or GROK_API_KEY before starting the editor, or set RUNG_API_KEY_FILE to a local key file.',
    }
  }

  const session = new StSession(request.source, request.variables)
  const messages: ApiMessage[] = [
    { role: 'system', content: systemPrompt(request.pouName, session) },
    ...request.messages.map((item) => ({ role: item.role, content: item.content })),
  ]

  let reply = ''

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const { message, error } = await complete(apiKey, messages)
    if (error !== undefined) return { ok: false, error }

    const content = message.content?.trim() ?? ''
    if (content !== '') reply = content

    const calls = message.tool_calls ?? []
    if (calls.length === 0) break

    messages.push({
      role: 'assistant',
      content: message.content ?? null,
      tool_calls: calls,
    })

    for (const call of calls) {
      const output = session.run(call.function.name, parseArguments(call.function.arguments))
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: output,
      })
    }
  }

  if (!session.didEdit && reply !== '') {
    const fenced = fenceFallback(reply, request.source)
    if (fenced !== undefined) {
      session.source = fenced
      session.didEdit = true
    }
  }

  if (reply === '') {
    reply = session.didEdit ? 'Updated the Structured Text in the editor pane.' : 'The planner returned no message.'
  }

  return {
    ok: true,
    text: reply,
    source: session.source,
    didEdit: session.didEdit,
    variables: session.variables,
  }
}
