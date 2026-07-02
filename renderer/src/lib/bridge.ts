import { toTeam } from '@/lib/countries'

const WORKER_SPEC = '/workers/main.js'

export type Team = { code: string; alpha3: string; flag: string; name: string }

export type Match = {
  id: string
  teamA: Team
  teamB: Team
  status: 'open' | 'locked'
  createdAt: number
  lockedAt?: number
  resultAt?: number
  result?: { a: number; b: number }
}

export type MatchPrediction = {
  author: string
  authorName: string
  status: 'committed' | 'revealed' | 'invalid'
  score?: string
  committedAt?: number
}

export type ChatMessage = {
  author: string
  authorName: string
  text: string
  createdAt: number
  seq: number
}

export type LogState = {
  matches: Match[]
  predictions: Record<string, MatchPrediction[]>
  messages: Record<string, ChatMessage[]>
  mine: Record<string, { a: number; b: number }>
  host: string | null
  isHost: boolean
  writable: boolean
  localAuthor: string
  status: 'connecting' | 'connected'
}

export type RoomEntry = {
  storeDir: string
  key: string
  name: string
  createdAt: number
}

export type WorkerEvent =
  | { evt: 'room-ready'; key: string }
  | ({ evt: 'log-state' } & LogState)
  | { evt: 'room-left' }
  | { evt: 'error'; message: string }
  | { evt: 'rooms-list'; rooms: RoomEntry[] }

export type Command =
  | { cmd: 'create-room'; name: string }
  | { cmd: 'join-room'; name: string; key: string }
  | { cmd: 'leave-room' }
  | { cmd: 'add-match'; teamA: Team; teamB: Team }
  | { cmd: 'lock-match'; matchId: string }
  | { cmd: 'set-result'; matchId: string; a: number; b: number }
  | { cmd: 'commit'; matchId: string; a: number; b: number }
  | { cmd: 'send-message'; matchId: string; text: string }
  | { cmd: 'list-rooms' }
  | { cmd: 'rejoin-room'; storeDir: string; key: string; name: string }

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

const nativeBridge = window.bridge

function toText(data: unknown): string {
  if (typeof data === 'string') return data
  return new TextDecoder().decode(data as ArrayBufferView)
}

export function startWorker(): void {
  nativeBridge.startWorker(WORKER_SPEC)
}

export function send(cmd: Command): void {
  nativeBridge.writeWorkerIPC(WORKER_SPEC, JSON.stringify(cmd))
}

export function onEvent(cb: (e: WorkerEvent) => void): () => void {
  return nativeBridge.onWorkerIPC(WORKER_SPEC, (data) => {
    let msg: unknown
    try {
      msg = JSON.parse(toText(data))
    } catch {
      return // ignore non-JSON control strings (updating/updated/Hello from worker)
    }
    if (msg && typeof msg === 'object' && 'evt' in msg) {
      const e = msg as WorkerEvent
      if (e.evt === 'log-state') {
        e.matches = e.matches.map((m) => ({
          ...m,
          teamA: typeof m.teamA === 'string' ? toTeam(m.teamA) : m.teamA,
          teamB: typeof m.teamB === 'string' ? toTeam(m.teamB) : m.teamB,
        }))
      }
      cb(e)
    }
  })
}

export function pkgVersion(): string {
  try {
    return nativeBridge.pkg().version
  } catch {
    return ''
  }
}
