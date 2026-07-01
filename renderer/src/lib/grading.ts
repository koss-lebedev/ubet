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

const TIER_BY_POINTS: Record<number, Tier> = { 4: 'exact', 3: 'diff', 2: 'tendency', 0: 'miss' }

export function tierFromPoints(points: number): Tier {
  return TIER_BY_POINTS[points] ?? 'miss'
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

export type LeaderboardTable = {
  matches: Match[]
  rows: { authorName: string; points: Record<string, number | null>; total: number }[]
}

export function leaderboardTable(
  matches: Match[],
  predictions: Record<string, MatchPrediction[]>
): LeaderboardTable {
  const authorNames = new Set<string>()
  for (const list of Object.values(predictions)) {
    for (const p of list) authorNames.add(p.authorName)
  }

  const rows = [...authorNames].map((authorName) => {
    const points: Record<string, number | null> = {}
    let total = 0
    for (const match of matches) {
      const pred = (predictions[match.id] ?? []).find((p) => p.authorName === authorName)
      const parsed = pred?.status === 'revealed' && pred.score ? parseScore(pred.score) : null
      const value = match.result && parsed ? pointsFor(gradePrediction(parsed, match.result)) : null
      points[match.id] = value
      if (value !== null) total += value
    }
    return { authorName, points, total }
  })

  rows.sort((a, b) => b.total - a.total || a.authorName.localeCompare(b.authorName))

  return { matches, rows }
}
