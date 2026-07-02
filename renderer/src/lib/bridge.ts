import { toTeam } from '@/lib/countries'

const WORKER_SPEC = '/workers/main.js'

export type Team = { code: string; alpha3: string; flag: string; name: string }

export type Match = {
  id: string
  teamA: Team
  teamB: Team
  status: 'open' | 'locked' | 'final'
  createdAt: number
  lockedAt?: number
  finishedAt?: number
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
  kind: 'message' | 'system'
  author: string
  authorName: string
  text: string
  createdAt: number
  seq: number
}

export type Participant = { address: string | null; name: string; verified: boolean }

export type Identity = { address: string; name: string }

export type LogState = {
  matches: Match[]
  predictions: Record<string, MatchPrediction[]>
  messages: Record<string, ChatMessage[]>
  participants: Record<string, Participant>
  mine: Record<string, { a: number; b: number }>
  host: string | null
  isHost: boolean
  writable: boolean
  localAuthor: string
  status: 'connecting' | 'connected'
}

export type TournamentEntry = {
  storeDir: string
  key: string
  name: string
  createdAt: number
}

export type WorkerEvent =
  | { evt: 'tournament-ready'; key: string }
  | ({ evt: 'log-state' } & LogState)
  | { evt: 'tournament-left' }
  | { evt: 'error'; message: string }
  | { evt: 'tournaments-list'; tournaments: TournamentEntry[] }

export type Command =
  | { cmd: 'create-tournament' }
  | { cmd: 'join-tournament'; key: string }
  | { cmd: 'leave-tournament' }
  | { cmd: 'add-match'; teamA: Team; teamB: Team }
  | { cmd: 'lock-match'; matchId: string }
  | { cmd: 'update-score'; matchId: string; a: number; b: number }
  | { cmd: 'finish-match'; matchId: string }
  | { cmd: 'commit'; matchId: string; a: number; b: number }
  | { cmd: 'send-message'; matchId: string; text: string }
  | { cmd: 'list-tournaments' }
  | { cmd: 'rejoin-tournament'; storeDir: string; key: string }

type Bridge = {
  pkg: () => { version: string }
  startWorker: (spec: string) => unknown
  writeWorkerIPC: (spec: string, data: string) => unknown
  onWorkerIPC: (spec: string, listener: (data: unknown) => void) => () => void
  getIdentity: () => Promise<Identity>
  setName: (name: string) => Promise<Identity>
  restoreIdentity: (phrase: string) => Promise<Identity>
  exportRecovery: () => Promise<string>
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
          teamB: typeof m.teamB === 'string' ? toTeam(m.teamB) : m.teamB
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

export function getIdentity(): Promise<Identity> {
  return nativeBridge.getIdentity()
}

export function setName(name: string): Promise<Identity> {
  return nativeBridge.setName(name)
}

export function restoreIdentity(phrase: string): Promise<Identity> {
  return nativeBridge.restoreIdentity(phrase)
}

export function exportRecovery(): Promise<string> {
  return nativeBridge.exportRecovery()
}
