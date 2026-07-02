import type { Match, MatchPrediction, ChatMessage } from '@/lib/bridge'

export type FeedEvent = 'created' | 'committed' | 'closed' | 'scored'

export type FeedItem =
  | { kind: 'message'; ts: number; author: string; authorName: string; text: string; seq: number }
  | { kind: 'event'; ts: number; event: FeedEvent; label: string }

// When two items share a timestamp, events come before messages, and events
// order among themselves by this rank (match lifecycle order).
const EVENT_RANK: Record<FeedEvent, number> = {
  created: 0,
  committed: 1,
  closed: 2,
  scored: 3
}

function has(ts: number | undefined): ts is number {
  return typeof ts === 'number' && Number.isFinite(ts)
}

/**
 * Merge a match's system events and chat messages into one chronological feed.
 * Events with a missing timestamp (e.g. data from before timestamps existed) are
 * dropped rather than piled at t=0.
 */
export function buildFeed(
  match: Match,
  predictions: MatchPrediction[],
  messages: ChatMessage[]
): FeedItem[] {
  const items: FeedItem[] = []

  if (has(match.createdAt)) {
    items.push({ kind: 'event', ts: match.createdAt, event: 'created', label: 'Match created' })
  }

  for (const p of predictions) {
    if (has(p.committedAt)) {
      items.push({
        kind: 'event',
        ts: p.committedAt,
        event: 'committed',
        label: `${p.authorName} made a prediction`
      })
    }
  }

  if (has(match.lockedAt)) {
    items.push({ kind: 'event', ts: match.lockedAt, event: 'closed', label: 'Voting closed' })
  }

  if (has(match.resultAt) && match.result) {
    items.push({
      kind: 'event',
      ts: match.resultAt,
      event: 'scored',
      label: `Score updated — ${match.result.a}–${match.result.b}`
    })
  }

  for (const m of messages) {
    items.push({
      kind: 'message',
      ts: m.createdAt,
      author: m.author,
      authorName: m.authorName,
      text: m.text,
      seq: m.seq
    })
  }

  items.sort((x, y) => {
    if (x.ts !== y.ts) return x.ts - y.ts
    // events before messages at equal ts
    const gx = x.kind === 'event' ? 0 : 1
    const gy = y.kind === 'event' ? 0 : 1
    if (gx !== gy) return gx - gy
    if (x.kind === 'event' && y.kind === 'event') {
      if (EVENT_RANK[x.event] !== EVENT_RANK[y.event]) {
        return EVENT_RANK[x.event] - EVENT_RANK[y.event]
      }
      return x.label.localeCompare(y.label)
    }
    if (x.kind === 'message' && y.kind === 'message') return x.seq - y.seq
    return 0
  })

  return items
}
