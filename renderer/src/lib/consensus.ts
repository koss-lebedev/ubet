import type { MatchPrediction } from '@/lib/bridge'

export type Outcome = 'first' | 'draw' | 'second'

export type Consensus = {
  revealedCount: number
  outcome: {
    firstPct: number
    drawPct: number
    secondPct: number
    majority: Outcome | null
  }
  popular: { score: string; count: number } | null
  avg: { a: number; b: number; total: number }
  contrarians: string[]
  uniquePicks: { authorName: string; score: string }[]
}

type Revealed = { authorName: string; score: string; a: number; b: number; outcome: Outcome }

export function classify(a: number, b: number): Outcome {
  if (a > b) return 'first'
  if (a < b) return 'second'
  return 'draw'
}

export function parseScore(score: string): { a: number; b: number } | null {
  const parts = score.split('-')
  if (parts.length !== 2) return null
  const a = Number(parts[0])
  const b = Number(parts[1])
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return null
  return { a, b }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function computeConsensus(predictions: MatchPrediction[]): Consensus {
  const revealed: Revealed[] = []
  for (const p of predictions) {
    if (p.status !== 'revealed' || !p.score) continue
    const parsed = parseScore(p.score)
    if (!parsed) continue
    revealed.push({
      authorName: p.authorName,
      score: p.score,
      a: parsed.a,
      b: parsed.b,
      outcome: classify(parsed.a, parsed.b)
    })
  }

  const revealedCount = revealed.length

  const counts = { first: 0, draw: 0, second: 0 }
  for (const r of revealed) counts[r.outcome]++

  const firstPct = revealedCount ? Math.round((counts.first / revealedCount) * 100) : 0
  const drawPct = revealedCount ? Math.round((counts.draw / revealedCount) * 100) : 0
  const secondPct = revealedCount ? Math.max(0, 100 - firstPct - drawPct) : 0

  const top = Math.max(counts.first, counts.draw, counts.second)
  const leaders = (['first', 'draw', 'second'] as Outcome[]).filter((o) => counts[o] === top)
  const majority = revealedCount > 0 && leaders.length === 1 ? leaders[0] : null

  // Popular scoreline (mode), ties broken by first-encountered order.
  const scoreCounts = new Map<string, number>()
  for (const r of revealed) scoreCounts.set(r.score, (scoreCounts.get(r.score) ?? 0) + 1)
  let popular: { score: string; count: number } | null = null
  for (const r of revealed) {
    const count = scoreCounts.get(r.score)!
    if (!popular || count > popular.count) popular = { score: r.score, count }
  }

  const sum = revealed.reduce((acc, r) => ({ a: acc.a + r.a, b: acc.b + r.b }), { a: 0, b: 0 })
  const avg = revealedCount
    ? {
        a: round1(sum.a / revealedCount),
        b: round1(sum.b / revealedCount),
        total: round1((sum.a + sum.b) / revealedCount)
      }
    : { a: 0, b: 0, total: 0 }

  const contrarians = majority
    ? revealed.filter((r) => r.outcome !== majority).map((r) => r.authorName)
    : []

  const uniquePicks = revealed
    .filter((r) => scoreCounts.get(r.score) === 1)
    .map((r) => ({ authorName: r.authorName, score: r.score }))

  return {
    revealedCount,
    outcome: { firstPct, drawPct, secondPct, majority },
    popular,
    avg,
    contrarians,
    uniquePicks
  }
}
