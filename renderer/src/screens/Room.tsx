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
import { LogOut, Plus, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { send, type LogState, type Match, type MatchPrediction, type Team } from '@/lib/bridge'
import { COUNTRIES, flagOf, toTeam } from '@/lib/countries'
import { computeConsensus, type Consensus } from '@/lib/consensus'

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
        <div className='flex flex-col items-center gap-1'>
          <span className='text-7xl leading-none'>{match.teamA.flag}</span>
          <span className='text-xs font-mono font-semibold tracking-widest'>
            {match.teamA.alpha3}
          </span>
        </div>
        <span className='text-sm text-muted-foreground'>vs</span>
        <div className='flex flex-col items-center gap-1'>
          <span className='text-7xl leading-none'>{match.teamB.flag}</span>
          <span className='text-xs font-mono font-semibold tracking-widest'>
            {match.teamB.alpha3}
          </span>
        </div>
      </div>

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
          {(() => {
            const consensus = computeConsensus(predictions)
            return consensus.revealedCount >= 2 ? (
              <MatchConsensus consensus={consensus} teamA={match.teamA} teamB={match.teamB} />
            ) : null
          })()}
          <ul className='space-y-1'>
            {predictions.map((p) => (
              <li key={p.author} className='flex items-center justify-between gap-2 text-sm'>
                <span>
                  {p.authorName}
                  {p.status === 'revealed' ? <span className='font-mono'> {p.score}</span> : null}
                </span>
                {p.status !== 'revealed' ? (
                  <Badge variant={STATUS_VARIANT[p.status]}>{p.status}</Badge>
                ) : null}
              </li>
            ))}
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

      <main className='flex-1 overflow-y-auto p-6'>
        <h2 className='mb-4 text-lg font-semibold'>Matches</h2>
        {log.matches.length === 0 ? (
          <p className='text-sm text-muted-foreground'>No matches yet.</p>
        ) : (
          <Tabs defaultValue={log.matches[0].id}>
            <div className='overflow-x-auto tab-scroll-fade'>
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
              <TabsContent key={m.id} value={m.id}>
                <MatchCard
                  match={m}
                  predictions={log.predictions[m.id] ?? []}
                  mine={log.mine[m.id]}
                  isHost={log.isHost}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </main>
    </div>
  )
}
