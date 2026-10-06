/**
 * LOCAL SKETCH ONLY — not an OpenPLC product feature.
 *
 * ST on the left is the program. This pane is a display-only picture of that ST,
 * drawn with OpenPLC's own contact / coil / block assets. It never changes
 * pou.body.language and never writes an LD graph back over the source.
 */

import './rung-ladder-preview.css'

import { useMemo } from 'react'

import { BlockNodeVisual } from '../../../_atoms/graphical-editor/ladder/block-visual'
import { CoilVisual } from '../../../_atoms/graphical-editor/ladder/coil-visual'
import { ContactVisual } from '../../../_atoms/graphical-editor/ladder/contact-visual'
import {
  DEFAULT_BLOCK_CONNECTOR_Y_OFFSET,
  DEFAULT_BLOCK_HEIGHT,
  DEFAULT_BLOCK_WIDTH,
} from '../../../_atoms/graphical-editor/ladder/utils/constants'

type MathOp = '+' | '-' | '*' | '/'

const MATH_RE =
  /^([A-Za-z_][A-Za-z0-9_]*)\s*:=\s*([A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?)\s*([+\-*/])\s*([A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?)$/
const ASSIGN_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*:=\s*(.+)$/
const COMPARE_RE =
  /^([A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?)\s*(<>|<=|>=|=|<|>)\s*([A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?)$/
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

type DisplayItem =
  | { kind: 'contact'; name: string; variant: 'default' | 'negated' }
  | { kind: 'coil'; name: string; variant: 'default' | 'set' | 'reset' }
  | { kind: 'block'; name: string; inputs: string[]; outputs: string[] }

type DisplayRung = {
  id: string
  items: DisplayItem[]
}

function stripComments(source: string): string {
  return source.replace(/\(\*[\s\S]*?\*\)/g, ' ').replace(/\/\/.*$/gm, ' ')
}

function tokenizeStatements(source: string): string[] {
  const flattened = stripComments(source)
    .replace(/\bEND_IF\s*;/gi, 'END_IF;')
    .replace(/\bTHEN\b/gi, ' THEN ')
  const parts: string[] = []
  for (const raw of flattened.split(';')) {
    const text = raw.replace(/\s+/g, ' ').trim()
    if (text === '') continue
    const ifMatch = /^(IF)\s+(.+?)\s+THEN\s+(.*)$/i.exec(text)
    if (ifMatch) {
      parts.push(`IF ${ifMatch[2].trim()} THEN`)
      if (ifMatch[3].trim() !== '') parts.push(ifMatch[3].trim())
      continue
    }
    parts.push(text)
  }
  return parts
}

function mathBlock(op: MathOp): string {
  switch (op) {
    case '+':
      return 'ADD'
    case '-':
      return 'SUB'
    case '*':
      return 'MUL'
    case '/':
      return 'DIV'
  }
}

function compareBlock(op: string): string {
  switch (op) {
    case '=':
      return 'EQ'
    case '<>':
      return 'NE'
    case '<':
      return 'LT'
    case '<=':
      return 'LE'
    case '>':
      return 'GT'
    case '>=':
      return 'GE'
    default:
      return 'EQ'
  }
}

function contactsFromBoolExpr(expr: string): DisplayItem[] {
  return expr
    .replace(/[()]/g, ' ')
    .split(/\s+AND\s+/i)
    .flatMap((part) => part.split(/\s+OR\s+/i))
    .map((part) => part.trim())
    .filter((part) => part !== '' && !/^(THEN|DO)$/i.test(part))
    .flatMap((part): DisplayItem[] => {
      const compare = COMPARE_RE.exec(part)
      if (compare) {
        return [
          {
            kind: 'block',
            name: compareBlock(compare[2]),
            inputs: [compare[1], compare[3]],
            outputs: ['BOOL'],
          },
        ]
      }
      const negated = /^NOT\s+/i.test(part)
      const symbol = negated ? part.replace(/^NOT\s+/i, '').trim() : part
      if (!IDENT_RE.test(symbol)) return []
      return [{ kind: 'contact', name: symbol, variant: negated ? 'negated' : 'default' }]
    })
}

function rungsFromSt(source: string): DisplayRung[] {
  const rungs: DisplayRung[] = []
  const conditionStack: string[] = []
  let index = 0

  const emit = (items: DisplayItem[]): void => {
    const guards = conditionStack.flatMap((expr) => contactsFromBoolExpr(expr))
    rungs.push({ id: `R${index}`, items: [...guards, ...items] })
    index += 1
  }

  for (const text of tokenizeStatements(source)) {
    if (/^(PROGRAM|END_PROGRAM|VAR|END_VAR|CONFIGURATION|END_CONFIGURATION)/i.test(text)) continue

    const ifOpen = /^IF\s+(.+?)\s+THEN$/i.exec(text)
    if (ifOpen) {
      conditionStack.push(ifOpen[1].trim())
      continue
    }
    if (/^END_IF$/i.test(text)) {
      conditionStack.pop()
      continue
    }

    const math = MATH_RE.exec(text)
    if (math) {
      emit([
        {
          kind: 'block',
          name: mathBlock(math[3] as MathOp),
          inputs: [math[2], math[4]],
          outputs: [math[1]],
        },
      ])
      continue
    }

    const assign = ASSIGN_RE.exec(text)
    if (!assign) continue
    const dest = assign[1]
    const rhs = assign[2].trim()

    if (/^TRUE$/i.test(rhs)) {
      emit([{ kind: 'coil', name: dest, variant: 'set' }])
      continue
    }
    if (/^FALSE$/i.test(rhs)) {
      emit([{ kind: 'coil', name: dest, variant: 'reset' }])
      continue
    }
    const compare = COMPARE_RE.exec(rhs)
    if (compare) {
      emit([
        {
          kind: 'block',
          name: compareBlock(compare[2]),
          inputs: [compare[1], compare[3]],
          outputs: ['BOOL'],
        },
        { kind: 'coil', name: dest, variant: 'default' },
      ])
      continue
    }
    if (IDENT_RE.test(rhs)) {
      emit([
        { kind: 'contact', name: rhs, variant: 'default' },
        { kind: 'coil', name: dest, variant: 'default' },
      ])
      continue
    }
    emit([...contactsFromBoolExpr(rhs), { kind: 'coil', name: dest, variant: 'default' }])
  }

  return rungs
}

function Wire() {
  return <div className='display-wire' />
}

function Rail() {
  return <div className='display-rail' />
}

function DisplayItemView(item: DisplayItem) {
  if (item.kind === 'contact') {
    return <ContactVisual variant={item.variant} variableName={item.name} className='pointer-events-none' />
  }
  if (item.kind === 'coil') {
    return <CoilVisual variant={item.variant} variableName={item.name} className='pointer-events-none' />
  }
  const extra = Math.max(0, item.inputs.length - 1) * DEFAULT_BLOCK_CONNECTOR_Y_OFFSET
  return (
    <BlockNodeVisual
      blockName={item.name}
      inputConnectors={item.inputs.map((name, index) => `IN${index + 1}  ${name}`)}
      outputConnectors={item.outputs.map((name) => `OUT  ${name}`)}
      width={DEFAULT_BLOCK_WIDTH}
      height={DEFAULT_BLOCK_HEIGHT + extra}
      disabled
      className='pointer-events-none'
    />
  )
}

export function RungLadderPreview(props: { source: string }) {
  const rungs = useMemo(() => rungsFromSt(props.source), [props.source])

  return (
    <div className='rung-ir-preview flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-brand-light bg-white dark:bg-neutral-950'>
      <div className='border-b border-brand-light px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500'>
        Display only · ST is the program
      </div>
      <div className='flex-1 overflow-auto p-3'>
        {rungs.length === 0 ? (
          <p className='font-mono text-xs opacity-70'>Type an assignment such as SUM := A + B;</p>
        ) : (
          rungs.map((rung) => (
            <div key={rung.id} className='display-rung'>
              <div className='display-rung-name'>{rung.id}</div>
              <div className='display-rung-row'>
                <Rail />
                <Wire />
                {rung.items.map((item, itemIndex) => (
                  <div key={`${rung.id}-${itemIndex}`} className='flex items-center'>
                    <DisplayItemView {...item} />
                    <Wire />
                  </div>
                ))}
                <div className='display-wire display-wire-grow' />
                <Rail />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
