import { useEffect, useRef, useState } from 'react'

import type { PLCVariable, VariableClass } from '../../../../../middleware/shared/ports/types'
import { useOpenPLCStore } from '../../../../store'

type ChatTurn = {
  id: string
  role: 'user' | 'assistant'
  content: string
  didEdit?: boolean
}

type AgentVariable = {
  name: string
  class: string
  type: string
}

declare global {
  interface Window {
    rungAgent?: {
      chat: (request: {
        messages: { role: 'user' | 'assistant'; content: string }[]
        pouName: string
        source: string
        variables: AgentVariable[]
      }) => Promise<
        | { ok: true; text: string; source: string; didEdit: boolean; variables: AgentVariable[] }
        | { ok: false; error: string }
      >
    }
  }
}

const VARIABLE_CLASSES = new Set<VariableClass>(['input', 'output', 'inOut', 'external', 'local', 'temp', 'global'])

function asClass(value: string): VariableClass {
  return VARIABLE_CLASSES.has(value as VariableClass) ? (value as VariableClass) : 'local'
}

function asAgentVariables(variables: readonly PLCVariable[]): AgentVariable[] {
  return variables.map((item) => ({
    name: item.name,
    class: item.class ?? 'local',
    type: item.type.value,
  }))
}

/**
 * LOCAL SKETCH: ChatGPT-style agent that can edit the ST pane.
 */
export function RungAgentChat() {
  const pous = useOpenPLCStore((s) => s.project.data.pous)
  const editorName = useOpenPLCStore((s) => s.editor.meta.name)
  const updatePou = useOpenPLCStore((s) => s.projectActions.updatePou)
  const createVariable = useOpenPLCStore((s) => s.projectActions.createVariable)
  const markDirty = useOpenPLCStore((s) => s.sharedWorkspaceActions.handleFileAndWorkspaceSavedState)
  const [turns, setTurns] = useState<ChatTurn[]>([
    {
      id: 'hello',
      role: 'assistant',
      content:
        'I can edit the Structured Text on the left, the same way Cursor edits a file. Ask me to change the program — the pane and the ladder sketch should update.',
    },
  ])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const bottomRef = useRef<HTMLDivElement>(null)

  const pou = pous.find((item) => item.name === editorName)
  const language = pou?.body.language ?? 'st'
  const stBody = typeof pou?.body.value === 'string' ? pou.body.value : ''
  const pouVariables = pou?.interface?.variables ?? []

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [turns, busy])

  const applyEdits = (source: string, variables: readonly AgentVariable[]): void => {
    if (pou === undefined || language !== 'st') return
    if (source !== stBody) {
      updatePou({ name: editorName, content: { language: 'st', value: source } })
      markDirty(editorName)
    }
    const existing = new Set(pouVariables.map((item) => item.name.toLowerCase()))
    for (const item of variables) {
      if (existing.has(item.name.toLowerCase())) continue
      createVariable({
        scope: 'local',
        associatedPou: editorName,
        data: {
          name: item.name,
          class: asClass(item.class),
          type: { definition: 'base-type', value: item.type },
          location: '',
          documentation: '',
        },
      })
      existing.add(item.name.toLowerCase())
      markDirty(editorName)
    }
  }

  const send = async (): Promise<void> => {
    const text = draft.trim()
    if (text === '' || busy) return
    const userTurn: ChatTurn = { id: crypto.randomUUID(), role: 'user', content: text }
    const history = [...turns, userTurn]
    setTurns(history)
    setDraft('')
    setBusy(true)
    setError(undefined)

    if (language !== 'st') {
      setTurns((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'This sketch only edits Structured Text POUs. Open an ST program in the left pane.',
        },
      ])
      setBusy(false)
      return
    }

    try {
      if (window.rungAgent === undefined) {
        setError('Restart the local OpenPLC window so the Agent tab can talk to Grok.')
        setBusy(false)
        return
      }
      const result = await window.rungAgent.chat({
        pouName: editorName,
        source: stBody,
        variables: asAgentVariables(pouVariables),
        messages: history
          .filter((turn) => turn.id !== 'hello')
          .map((turn) => ({ role: turn.role, content: turn.content })),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (result.didEdit) applyEdits(result.source, result.variables)
      setTurns((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: result.text,
          didEdit: result.didEdit,
        },
      ])
    } catch (caught) {
      setError(String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className='flex h-full min-h-0 w-full flex-col border-l border-brand-light bg-white dark:bg-neutral-950'>
      <header className='flex items-center justify-between border-b border-brand-light px-4 py-3'>
        <div>
          <div className='text-sm font-semibold'>Agent</div>
          <div className='text-xs text-neutral-500'>Grok · edits the ST pane · {editorName}</div>
        </div>
      </header>

      <div className='min-h-0 flex-1 space-y-3 overflow-auto px-4 py-4'>
        {turns.map((turn) => (
          <div key={turn.id} className={turn.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                turn.role === 'user'
                  ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-3 py-2 text-sm text-white'
                  : 'max-w-[85%] rounded-2xl rounded-bl-sm bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-800'
              }
            >
              <div className='mb-1 text-[10px] uppercase tracking-wide opacity-70'>
                {turn.role === 'user' ? 'You' : turn.didEdit === true ? 'Grok · edited pane' : 'Grok'}
              </div>
              <div className='whitespace-pre-wrap leading-5'>{turn.content}</div>
            </div>
          </div>
        ))}
        {busy ? <div className='text-xs text-neutral-500'>Grok is editing…</div> : undefined}
        {error !== undefined ? <div className='text-xs text-red-500'>{error}</div> : undefined}
        <div ref={bottomRef} />
      </div>

      <form
        className='border-t border-brand-light p-3'
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <textarea
          className='mb-2 h-20 w-full resize-none rounded-lg border border-brand-light bg-transparent p-2 text-sm outline-none focus:border-blue-500'
          placeholder='Tell Grok what to change in this program…'
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
        />
        <button
          type='submit'
          disabled={busy || draft.trim() === ''}
          className='w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-40'
        >
          Send
        </button>
      </form>
    </div>
  )
}
