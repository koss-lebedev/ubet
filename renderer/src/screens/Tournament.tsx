import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { LogOut, Plus, Trophy, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { send, type LogState, type Match, type MatchPrediction, type Team } from '@/lib/bridge'
import { MatchChat } from '@/components/MatchChat'
import { COUNTRIES, flagOf, toTeam } from '@/lib/countries'
import { classify, computeConsensus, parseScore } from '@/lib/consensus'
import {
  gradePrediction,
  leaderboardTable,
  pointsFor,
  tierFromPoints,
  type Tier
} from '@/lib/grading'

const TEAM_OPTIONS: ComboboxOption[] = COUNTRIES.map((c) => ({
  value: c.code,
  label: (
    <>
      {flagOf(c.code)} {c.name}
    </>
  ),
  keywords: `${c.name} ${c.alpha3}`
}))

function AddMatch() {
  const [open, setOpen] = useState(false)
  const [a, setA] = useState('')
  const [b, setB] = useState('')

  function add() {
    if (!a || !b || a === b) return
    send({ cmd: 'add-match', teamA: toTeam(a), teamB: toTeam(b) })
    setA('')
    setB('')
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size='icon' variant='glass' className='size-11' title='Add match'>
          <Plus className='size-5' />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a match</DialogTitle>
        </DialogHeader>
        <div className='space-y-3'>
          <Combobox
            options={TEAM_OPTIONS}
            value={a}
            onValueChange={setA}
            placeholder='Team A'
            searchPlaceholder='Search teams...'
          />
          <Combobox
            options={TEAM_OPTIONS}
            value={b}
            onValueChange={setB}
            placeholder='Team B'
            searchPlaceholder='Search teams...'
          />
          <Button
            className='w-full'
            variant='secondary'
            onClick={add}
            disabled={!a || !b || a === b}
          >
            Add match
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ScoreEntry({ match, mine }: { match: Match; mine?: { a: number; b: number } }) {
  const [a, setA] = useState(mine ? String(mine.a) : '')
  const [b, setB] = useState(mine ? String(mine.b) : '')

  function submit() {
    const na = Number(a)
    const nb = Number(b)
    if (!Number.isInteger(na) || !Number.isInteger(nb) || na < 0 || nb < 0) {
      toast('Enter whole numbers for both scores')
      return
    }
    send({ cmd: 'commit', matchId: match.id, a: na, b: nb })
  }

  return (
    <div className='flex items-end gap-2'>
      <div className='space-y-1'>
        <Label className='text-xs'>{match.teamA.flag}</Label>
        <Input
          type='number'
          min={0}
          className='w-16'
          value={a}
          onChange={(e) => setA(e.target.value)}
        />
      </div>
      <span className='pb-2'>–</span>
      <div className='space-y-1'>
        <Label className='text-xs'>{match.teamB.flag}</Label>
        <Input
          type='number'
          min={0}
          className='w-16'
          value={b}
          onChange={(e) => setB(e.target.value)}
        />
      </div>
      <Button className='ml-auto' onClick={submit}>
        {mine ? 'Update' : 'Submit'}
      </Button>
    </div>
  )
}

function FlagCircle({ code, size = 112 }: { code: string; size?: number }) {
  return (
    <span
      className={`fi fi-${code.toLowerCase()} fis block rounded-full ring-1 ring-white/10`}
      style={{ width: size, height: size, backgroundSize: 'cover' }}
    />
  )
}

const TIER_LABEL: Record<Tier, string> = {
  exact: 'Exact',
  diff: 'Diff',
  tendency: 'Tendency',
  miss: 'Miss'
}

const TIER_TEXT_CLASS: Record<Tier, string> = {
  exact: 'text-primary font-semibold',
  diff: 'text-[oklch(0.68_0.15_250)] font-semibold',
  tendency: 'text-foreground',
  miss: 'text-muted-foreground'
}

function ResultEntry({ match }: { match: Match }) {
  const [a, setA] = useState(match.result ? String(match.result.a) : '')
  const [b, setB] = useState(match.result ? String(match.result.b) : '')

  function submit() {
    const na = Number(a)
    const nb = Number(b)
    if (!Number.isInteger(na) || !Number.isInteger(nb) || na < 0 || nb < 0) {
      toast('Enter whole numbers for both scores')
      return
    }
    send({ cmd: 'set-result', matchId: match.id, a: na, b: nb })
  }

  return (
    <div className='flex items-end gap-2 rounded-md border border-dashed p-3'>
      <div className='space-y-1'>
        <Label className='text-xs'>Result {match.teamA.flag}</Label>
        <Input
          type='number'
          min={0}
          className='w-16'
          value={a}
          onChange={(e) => setA(e.target.value)}
        />
      </div>
      <span className='pb-2'>–</span>
      <div className='space-y-1'>
        <Label className='text-xs'>{match.teamB.flag}</Label>
        <Input
          type='number'
          min={0}
          className='w-16'
          value={b}
          onChange={(e) => setB(e.target.value)}
        />
      </div>
      <Button className='ml-auto' variant='secondary' onClick={submit}>
        {match.result ? 'Update result' : 'Submit result'}
      </Button>
    </div>
  )
}

function Leaderboard({ log }: { log: LogState }) {
  const table = leaderboardTable(log.matches, log.predictions)
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size='icon' variant='glass' className='size-11' title='Leaderboard'>
          <Trophy className='size-5' />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leaderboard</DialogTitle>
        </DialogHeader>
        {table.matches.length === 0 ? (
          <p className='text-sm text-muted-foreground'>No matches yet.</p>
        ) : (
          <div className='overflow-x-auto scrollbar-hide'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b'>
                  <th className='bg-background sticky left-0 px-4 py-3 text-left font-medium'>
                    Player
                  </th>
                  {table.matches.map((m) => (
                    <th key={m.id} className='px-4 py-3 text-center font-mono whitespace-nowrap'>
                      {m.teamA.flag}/{m.teamB.flag}
                    </th>
                  ))}
                  <th className='bg-background sticky right-0 px-4 py-3 text-right font-medium'>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={row.authorName} className='border-b last:border-0'>
                    <td className='bg-background sticky left-0 px-4 py-3 font-medium whitespace-nowrap'>
                      <span className='text-muted-foreground font-mono'>{i + 1}</span>{' '}
                      {row.authorName}
                    </td>
                    {table.matches.map((m) => {
                      const points = row.points[m.id]
                      return (
                        <td
                          key={m.id}
                          className={
                            'px-4 py-3 text-center' +
                            (points === null
                              ? ' text-muted-foreground'
                              : ` ${TIER_TEXT_CLASS[tierFromPoints(points)]}`)
                          }
                        >
                          {points === null ? '–' : points}
                        </td>
                      )
                    })}
                    <td className='bg-background sticky right-0 px-4 py-3 text-right font-semibold'>
                      {row.total}
                    </td>
                  </tr>
                ))}
                {table.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={table.matches.length + 2}
                      className='text-muted-foreground px-2 py-3 text-center'
                    >
                      No predictions yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

type Stage = 'open' | 'locked' | 'final'

const STAGES: { key: Stage; label: string; color: string; bg: string }[] = [
  { key: 'open', label: 'Voting Open', color: '#F59E0B', bg: '#1A1500' },
  { key: 'locked', label: 'Locked', color: '#EF4444', bg: '#1A0808' },
  { key: 'final', label: 'Final', color: '#9CA3AF', bg: '#111827' }
]

function stageOf(match: Match): Stage {
  if (match.result) return 'final'
  return match.status === 'locked' ? 'locked' : 'open'
}

function TeamColumn({ team }: { team: Team }) {
  return (
    <div className='flex flex-1 flex-col items-center gap-3'>
      <FlagCircle code={team.code} size={96} />
      <span className='text-[26px] leading-none font-extrabold text-[#F0F6FC]'>{team.alpha3}</span>
    </div>
  )
}

function ScoreStatusBadge({ stage }: { stage: Stage }) {
  const s = STAGES.find((x) => x.key === stage)!
  return (
    <div
      className='flex items-center gap-2 rounded-full px-3.5 py-1.5'
      style={{ backgroundColor: s.bg }}
    >
      <span className='size-2 rounded-full' style={{ backgroundColor: s.color }} />
      <span className='text-[13px] font-bold' style={{ color: s.color }}>
        {s.label}
      </span>
    </div>
  )
}

function VoteDistribution({
  match,
  predictions
}: {
  match: Match
  predictions: MatchPrediction[]
}) {
  const { outcome } = computeConsensus(predictions)
  const segments = [
    { key: 'first', pct: outcome.firstPct, color: '#3B82F6' },
    { key: 'draw', pct: outcome.drawPct, color: '#4B5563' },
    { key: 'second', pct: outcome.secondPct, color: '#F59E0B' }
  ]
  return (
    <div className='relative flex flex-col gap-3'>
      <span className='text-[11px] font-semibold tracking-[1px] text-[#4B5563]'>
        VOTE DISTRIBUTION
      </span>
      <div className='flex h-3 w-full overflow-hidden rounded-md'>
        {segments
          .filter((s) => s.pct > 0)
          .map((s) => (
            <div key={s.key} style={{ flexGrow: s.pct, backgroundColor: s.color }} />
          ))}
      </div>
      <div className='flex justify-between gap-2 text-xs'>
        <span className='font-semibold text-[#3B82F6]'>
          {outcome.firstPct}% {match.teamA.alpha3} Win
        </span>
        <span className='text-[#6B7280]'>{outcome.drawPct}% Draw</span>
        <span className='font-semibold text-[#F59E0B]'>
          {outcome.secondPct}% {match.teamB.alpha3} Win
        </span>
      </div>
    </div>
  )
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function PredictionRow({ match, p }: { match: Match; p: MatchPrediction }) {
  const parsed = p.status === 'revealed' && p.score ? parseScore(p.score) : null
  const outcome = parsed ? classify(parsed.a, parsed.b) : null
  const avatarBg = outcome === 'first' ? '#3B82F6' : outcome === 'second' ? '#F59E0B' : '#64748B'
  const scoreColor = outcome === 'first' ? '#3B82F6' : outcome === 'second' ? '#F59E0B' : '#6B7280'
  const tier: Tier | null = match.result && parsed ? gradePrediction(parsed, match.result) : null
  return (
    <div className='flex items-center gap-3 border-t border-[#1E2A3B] bg-[#121217] px-5 py-3 first:border-t-0'>
      <span
        className='flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white'
        style={{ backgroundColor: avatarBg }}
      >
        {initials(p.authorName)}
      </span>
      <span className='flex-1 truncate text-sm font-semibold text-[#F0F6FC]'>{p.authorName}</span>
      <div className='flex flex-col items-end gap-1'>
        <div className='flex items-center gap-2'>
          {parsed ? (
            <span className='text-base font-bold' style={{ color: scoreColor }}>
              {parsed.a} - {parsed.b}
            </span>
          ) : (
            <span className='text-muted-foreground text-xs'>{p.status}</span>
          )}
          {tier ? (
            <span
              className={`rounded-md bg-[#1E2A3B] px-2.5 py-1 text-[11px] font-semibold ${TIER_TEXT_CLASS[tier]}`}
            >
              {TIER_LABEL[tier]} +{pointsFor(tier)}
            </span>
          ) : outcome === 'draw' ? (
            <span className='rounded-md bg-[#1E2A3B] px-2.5 py-1 text-[11px] font-semibold text-[#6B7280]'>
              DRAW
            </span>
          ) : null}
        </div>
        {p.committedAt ? (
          <span className='text-[11px] text-[#6B7280]'>{timeAgo(p.committedAt)}</span>
        ) : null}
      </div>
    </div>
  )
}

function PredictionsSection({
  match,
  predictions
}: {
  match: Match
  predictions: MatchPrediction[]
}) {
  return (
    <div className='relative flex flex-col overflow-hidden rounded-xl border border-[#1E2A3B]'>
      <div className='flex items-center gap-3 bg-[#0A0A0E] px-7 py-5'>
        <span className='flex-1 text-[18px] font-bold text-[#F0F6FC]'>Community Predictions</span>
        <span className='rounded-xl bg-[#141418] px-3 py-[5px] text-xs font-medium text-[#8B949E]'>
          {predictions.length} total
        </span>
      </div>
      {predictions.length === 0 ? (
        <p className='text-muted-foreground bg-[#121217] px-5 py-4 text-sm'>No predictions.</p>
      ) : (
        predictions.map((p) => <PredictionRow key={p.author} match={match} p={p} />)
      )}
    </div>
  )
}

function MatchCard({
  match,
  predictions,
  mine,
  isHost
}: {
  match: Match
  predictions: MatchPrediction[]
  mine?: { a: number; b: number }
  isHost: boolean
}) {
  const stage = stageOf(match)
  const showVotes = match.status === 'locked' && computeConsensus(predictions).revealedCount >= 2

  return (
    <div className='relative flex flex-col gap-7 overflow-hidden rounded-xl border border-[#1E2A3B] bg-[#0D0C12] p-8'>
      <div
        aria-hidden
        className='pointer-events-none absolute inset-0'
        style={{
          background:
            'radial-gradient(130% 100% at 50% 42%, rgba(124,58,237,0.25) 0%, rgba(124,58,237,0) 70%)'
        }}
      />

      <div className='relative flex items-start justify-between gap-4 py-8'>
        <TeamColumn team={match.teamA} />
        <div className='flex flex-col items-center gap-2.5 pt-5'>
          {match.result ? (
            <span className='text-[52px] leading-none font-extrabold text-[#F0F6FC]'>
              {match.result.a} - {match.result.b}
            </span>
          ) : (
            <span className='text-4xl font-bold text-[#4B5563]'>vs</span>
          )}
          <ScoreStatusBadge stage={stage} />
        </div>
        <TeamColumn team={match.teamB} />
      </div>

      <div className='relative h-px w-full bg-[#1E2A3B]' />

      {showVotes ? <VoteDistribution match={match} predictions={predictions} /> : null}

      {match.status === 'open' ? (
        <div className='relative flex flex-col gap-3'>
          <ScoreEntry key={match.id} match={match} mine={mine} />
          {isHost ? (
            <Button
              size='sm'
              variant='outline'
              className='self-start'
              onClick={() => send({ cmd: 'lock-match', matchId: match.id })}
            >
              Lock match
            </Button>
          ) : null}
          {predictions.length > 0 ? (
            <p className='text-sm text-muted-foreground'>
              Committed: {predictions.map((p) => p.authorName).join(' · ')}
            </p>
          ) : null}
        </div>
      ) : (
        <div className='relative flex flex-col gap-3'>
          {isHost ? <ResultEntry key={`result-${match.id}`} match={match} /> : null}
          <PredictionsSection match={match} predictions={predictions} />
        </div>
      )}
    </div>
  )
}

export function Tournament({ tournamentKey, log }: { tournamentKey: string; log: LogState }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(tournamentKey)
      toast('Tournament key copied')
    } catch {
      toast('Copy failed')
    }
  }

  return (
    <div className='flex h-screen'>
      <aside className='flex w-16 flex-col items-center gap-3 overflow-y-auto border-r bg-muted p-2'>
        <div
          className={`size-2.5 rounded-full ${log.status === 'connected' ? 'bg-green-500' : 'bg-muted-foreground'}`}
          title={log.status}
        />

        <Button
          size='icon'
          variant='glass'
          className='size-11'
          title='Invite (copy tournament key)'
          onClick={copy}
        >
          <UserPlus className='size-5' />
        </Button>

        {log.isHost ? <AddMatch /> : null}

        <Leaderboard log={log} />

        <Button
          size='icon'
          className='mt-auto size-11'
          variant='glass'
          title='Leave'
          onClick={() => send({ cmd: 'leave-tournament' })}
        >
          <LogOut className='size-5' />
        </Button>
      </aside>

      <main className='flex flex-1 flex-col overflow-hidden p-6'>
        <h2 className='mb-4 text-lg font-semibold'>Matches</h2>
        {log.matches.length === 0 ? (
          <p className='text-sm text-muted-foreground'>No matches yet.</p>
        ) : (
          <Tabs defaultValue={log.matches[0].id} className='flex flex-1 flex-col overflow-hidden'>
            <div className='shrink-0 overflow-x-auto scrollbar-hide tab-scroll-fade'>
              <TabsList className='h-auto w-fit gap-2 bg-transparent p-1'>
                {log.matches.map((m) => (
                  <TabsTrigger
                    key={m.id}
                    value={m.id}
                    className='data-[state=active]:bg-primary data-[state=active]:text-primary-foreground h-auto px-4 py-2 font-mono whitespace-nowrap'
                  >
                    {m.teamA.alpha3} {m.teamA.flag} / {m.teamB.flag} {m.teamB.alpha3}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {log.matches.map((m) => (
              <TabsContent key={m.id} value={m.id} className='overflow-hidden'>
                <div className='grid h-full grid-cols-[minmax(0,1fr)_minmax(0,420px)] gap-6 overflow-hidden'>
                  <div className='overflow-y-auto pr-1'>
                    <MatchCard
                      match={m}
                      predictions={log.predictions[m.id] ?? []}
                      mine={log.mine[m.id]}
                      isHost={log.isHost}
                    />
                  </div>
                  <MatchChat
                    match={m}
                    predictions={log.predictions[m.id] ?? []}
                    messages={log.messages[m.id] ?? []}
                    writable={log.writable}
                    localAuthor={log.localAuthor}
                  />
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </main>
    </div>
  )
}
