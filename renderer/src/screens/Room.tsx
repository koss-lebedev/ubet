import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { LogOut, Plus, Trophy, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { send, type LogState, type Match, type MatchPrediction, type Team } from '@/lib/bridge'
import { MatchChat } from '@/components/MatchChat'
import { COUNTRIES, flagOf, toTeam } from '@/lib/countries'
import { computeConsensus, parseScore, type Consensus } from '@/lib/consensus'
import {
  gradePrediction,
  leaderboardTable,
  pointsFor,
  tierFromPoints,
  type Tier
} from '@/lib/grading'

const STATUS_VARIANT: Record<MatchPrediction['status'], 'secondary' | 'default' | 'destructive'> = {
  committed: 'secondary',
  revealed: 'default',
  invalid: 'destructive'
}

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
          <Select value={a} onValueChange={setA}>
            <SelectTrigger>
              <SelectValue placeholder='Team A' />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {flagOf(c.code)} {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={b} onValueChange={setB}>
            <SelectTrigger>
              <SelectValue placeholder='Team B' />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {flagOf(c.code)} {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

function dash(score: string): string {
  return score.replace('-', '–')
}

function FlagCircle({ code, size = 112 }: { code: string; size?: number }) {
  return (
    <span
      className={`fi fi-${code.toLowerCase()} fis block rounded-full`}
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

const TIER_VARIANT: Record<Tier, 'default' | 'secondary' | 'outline'> = {
  exact: 'default',
  diff: 'secondary',
  tendency: 'outline',
  miss: 'outline'
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
                            (points === null ? ' text-muted-foreground' : ` ${TIER_TEXT_CLASS[tierFromPoints(points)]}`)
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

function MatchConsensus({
  consensus,
  teamA,
  teamB
}: {
  consensus: Consensus
  teamA: Team
  teamB: Team
}) {
  const { outcome, popular, avg, contrarians, uniquePicks } = consensus
  const segments = [
    { key: 'first', label: teamA.alpha3, pct: outcome.firstPct, className: 'bg-primary' },
    { key: 'draw', label: 'Draw', pct: outcome.drawPct, className: 'bg-muted-foreground' },
    { key: 'second', label: teamB.alpha3, pct: outcome.secondPct, className: 'bg-secondary' }
  ].filter((s) => s.pct > 0)

  return (
    <div className='space-y-2 rounded-md bg-muted/50 p-3'>
      <div className='flex h-2 w-full overflow-hidden rounded-full'>
        {segments.map((s) => (
          <div key={s.key} className={s.className} style={{ width: `${s.pct}%` }} />
        ))}
      </div>
      <div className='flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs'>
        {segments.map((s) => (
          <span key={s.key} className='text-muted-foreground'>
            {s.label} <span className='text-foreground font-medium'>{s.pct}%</span>
          </span>
        ))}
      </div>
      <div className='flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground'>
        {popular ? (
          <span>
            Popular <span className='text-foreground font-mono'>{dash(popular.score)}</span> ·{' '}
            {popular.count} of {consensus.revealedCount}
          </span>
        ) : null}
        <span>
          Avg total <span className='text-foreground'>{avg.total}</span> ·{' '}
          <span className='font-mono'>
            {avg.a}–{avg.b}
          </span>
        </span>
      </div>
      {contrarians.length > 0 || uniquePicks.length > 0 ? (
        <p className='text-xs text-muted-foreground'>
          {contrarians.length > 0 ? <>Contrarian: {contrarians.join(', ')}</> : null}
          {contrarians.length > 0 && uniquePicks.length > 0 ? ' · ' : ''}
          {uniquePicks.length > 0 ? (
            <>Unique: {uniquePicks.map((u) => `${dash(u.score)} (${u.authorName})`).join(', ')}</>
          ) : null}
        </p>
      ) : null}
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
  return (
    <div className='space-y-3 rounded-md border p-4'>
      <div className='flex items-center justify-end gap-2'>
        <Badge variant={match.status === 'locked' ? 'destructive' : 'secondary'}>
          {match.status === 'locked' ? 'game ended' : match.status}
        </Badge>
        {isHost && match.status === 'open' ? (
          <Button
            size='sm'
            variant='outline'
            onClick={() => send({ cmd: 'lock-match', matchId: match.id })}
          >
            Lock
          </Button>
        ) : null}
      </div>
      <div className='flex items-center justify-center gap-6'>
        <div className='flex flex-col items-center gap-2'>
          <FlagCircle code={match.teamA.code} />
          <span className='text-xs font-mono font-semibold tracking-widest'>
            {match.teamA.alpha3}
          </span>
        </div>
        <span className='text-sm text-muted-foreground'>vs</span>
        <div className='flex flex-col items-center gap-2'>
          <FlagCircle code={match.teamB.code} />
          <span className='text-xs font-mono font-semibold tracking-widest'>
            {match.teamB.alpha3}
          </span>
        </div>
      </div>

      {match.result ? (
        <div className='flex flex-col items-center gap-0.5'>
          <span className='text-muted-foreground text-xs font-medium tracking-widest'>RESULT</span>
          <span className='font-mono text-2xl font-semibold'>
            {match.result.a}–{match.result.b}
          </span>
        </div>
      ) : null}

      {match.status === 'open' ? (
        <>
          <ScoreEntry key={match.id} match={match} mine={mine} />
          {predictions.length > 0 ? (
            <p className='text-sm text-muted-foreground'>
              Committed: {predictions.map((p) => p.authorName).join(' · ')}
            </p>
          ) : null}
        </>
      ) : (
        <>
          {isHost ? <ResultEntry key={`result-${match.id}`} match={match} /> : null}
          {(() => {
            const consensus = computeConsensus(predictions)
            return consensus.revealedCount >= 2 ? (
              <MatchConsensus consensus={consensus} teamA={match.teamA} teamB={match.teamB} />
            ) : null
          })()}
          <ul className='space-y-1'>
            {predictions.map((p) => {
              const parsed = p.status === 'revealed' && p.score ? parseScore(p.score) : null
              const tier: Tier | null =
                match.result && parsed ? gradePrediction(parsed, match.result) : null
              return (
                <li key={p.author} className='flex items-center justify-between gap-2 text-sm'>
                  <span>
                    {p.authorName}
                    {p.status === 'revealed' ? <span className='font-mono'> {p.score}</span> : null}
                  </span>
                  {tier ? (
                    <Badge variant={TIER_VARIANT[tier]}>
                      {TIER_LABEL[tier]} +{pointsFor(tier)}
                    </Badge>
                  ) : p.status !== 'revealed' ? (
                    <Badge variant={STATUS_VARIANT[p.status]}>{p.status}</Badge>
                  ) : null}
                </li>
              )
            })}
            {predictions.length === 0 ? (
              <li className='text-sm text-muted-foreground'>No predictions.</li>
            ) : null}
          </ul>
        </>
      )}
    </div>
  )
}

export function Room({ roomKey, log }: { roomKey: string; log: LogState }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(roomKey)
      toast('Room key copied')
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
          title='Invite (copy room key)'
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
          onClick={() => send({ cmd: 'leave-room' })}
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
