// import './splash-screen/index'

import { contextBridge, ipcRenderer } from 'electron'

import rendererProcessBridge from '../ipc/renderer'

contextBridge.exposeInMainWorld('bridge', rendererProcessBridge)

/** LOCAL SKETCH: Grok chat stays in the main process so the API key never hits the renderer. */
contextBridge.exposeInMainWorld('rungAgent', {
  chat: (request: {
    messages: { role: 'user' | 'assistant'; content: string }[]
    pouName: string
    source: string
    variables: { name: string; class: string; type: string }[]
  }) => ipcRenderer.invoke('rung-agent:chat', request),
})

export type ElectronHandler = typeof rendererProcessBridge

declare global {
  interface Window {
    bridge: ElectronHandler
    rungAgent?: {
      chat: (request: {
        messages: { role: 'user' | 'assistant'; content: string }[]
        pouName: string
        source: string
        variables: { name: string; class: string; type: string }[]
      }) => Promise<
        | {
            ok: true
            text: string
            source: string
            didEdit: boolean
            variables: { name: string; class: string; type: string }[]
          }
        | { ok: false; error: string }
      >
    }
  }
}
