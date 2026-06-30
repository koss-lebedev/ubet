const WORKER_SPEC = '/workers/main.js'

export type Prediction = {
  id: string
  author: string
  authorName: string
  hash: string
  status: 'committed' | 'revealed' | 'invalid'
  pick?: string
}

export type LogState = {
  phase: 'open' | 'locked'
  host: string | null
  isHost: boolean
  writable: boolean
  status: 'connecting' | 'connected'
  predictions: Prediction[]
}

export type WorkerEvent =
  | { evt: 'room-ready'; key: string }
  | ({ evt: 'log-state' } & LogState)
  | { evt: 'room-left' }
  | { evt: 'error'; message: string }

export type Command =
  | { cmd: 'create-room'; name: string }
  | { cmd: 'join-room'; name: string; key: string }
  | { cmd: 'leave-room' }
  | { cmd: 'commit'; pick: string }
  | { cmd: 'lock' }
  | { cmd: 'reveal'; id: string }

type Bridge = {
  pkg: () => { version: string }
  startWorker: (spec: string) => unknown
  writeWorkerIPC: (spec: string, data: string) => unknown
  onWorkerIPC: (spec: string, listener: (data: unknown) => void) => () => void
}

declare global {
  interface Window {
    bridge: Bridge
  }
}

const bridge = window.bridge

function toText(data: unknown): string {
  if (typeof data === 'string') return data
  return new TextDecoder().decode(data as ArrayBufferView)
}

export function startWorker(): void {
  bridge.startWorker(WORKER_SPEC)
}

export function send(cmd: Command): void {
  bridge.writeWorkerIPC(WORKER_SPEC, JSON.stringify(cmd))
}

export function onEvent(cb: (e: WorkerEvent) => void): () => void {
  return bridge.onWorkerIPC(WORKER_SPEC, (data) => {
    let msg: unknown
    try {
      msg = JSON.parse(toText(data))
    } catch {
      return // ignore non-JSON control strings (updating/updated/Hello from worker)
    }
    if (msg && typeof msg === 'object' && 'evt' in msg) cb(msg as WorkerEvent)
  })
}

export function pkgVersion(): string {
  try {
    return bridge.pkg().version
  } catch {
    return ''
  }
}
