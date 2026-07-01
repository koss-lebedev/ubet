import type { Match, MatchPrediction } from '@/lib/bridge'
import { classify, parseScore } from '@/lib/consensus'

export type Tier = 'exact' | 'diff' | 'tendency' | 'miss'

const POINTS: Record<Tier, number> = {
  exact: 4,
  diff: 3,
  tendency: 2,
  miss: 0
}

export function pointsFor(tier: Tier): number {
  return POINTS[tier]
}

export function gradePrediction(
  pred: { a: number; b: number },
  result: { a: number; b: number }
): Tier {
  if (pred.a === result.a && pred.b === result.b) return 'exact'
  if (pred.a - pred.b === result.a - result.b) return 'diff'
  if (classify(pred.a, pred.b) === classify(result.a, result.b)) return 'tendency'
  return 'miss'
}

export type LeaderRow = {
  authorName: string
  points: number
  exact: number
  diff: number
  tendency: number
  miss: number
}

export function leaderboard(
  matches: Match[],
  predictions: Record<string, MatchPrediction[]>
): LeaderRow[] {
  const rows = new Map<string, LeaderRow>()

  for (const match of matches) {
    if (!match.result) continue
    for (const p of predictions[match.id] ?? []) {
      if (p.status !== 'revealed' || !p.score) continue
      const parsed = parseScore(p.score)
      if (!parsed) continue
      const tier = gradePrediction(parsed, match.result)
      let row = rows.get(p.authorName)
      if (!row) {
        row = { authorName: p.authorName, points: 0, exact: 0, diff: 0, tendency: 0, miss: 0 }
        rows.set(p.authorName, row)
      }
      row.points += pointsFor(tier)
      row[tier]++
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.points - a.points || a.authorName.localeCompare(b.authorName)
  )
}
