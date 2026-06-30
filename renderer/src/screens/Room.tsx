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
import { toast } from 'sonner'
import { send, type LogState, type Match, type MatchPrediction } from '@/lib/bridge'
import { COUNTRIES, flagOf, toTeam } from '@/lib/countries'

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
        <Button className='w-full' variant='secondary'>
          Add match
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
      <aside className='flex w-80 flex-col gap-4 overflow-y-auto border-r bg-muted p-4'>
        <Badge
          variant={log.status === 'connected' ? 'default' : 'secondary'}
          className={log.status === 'connected' ? 'w-fit bg-green-500 text-white' : 'w-fit'}
        >
          {log.status}
        </Badge>

        <div className='space-y-2'>
          <Label>Room key (share this to invite)</Label>
          <p className='font-mono text-xs break-all rounded-md bg-background p-2'>{roomKey}</p>
          <Button size='sm' variant='secondary' onClick={copy}>
            Copy
          </Button>
        </div>

        {log.isHost ? <AddMatch /> : null}

        <Button
          className='mt-auto w-full'
          variant='outline'
          onClick={() => send({ cmd: 'leave-room' })}
        >
          Leave
        </Button>
      </aside>

      <main className='flex-1 overflow-y-auto p-6'>
        <h2 className='mb-4 text-lg font-semibold'>Matches</h2>
        {log.matches.length === 0 ? (
          <p className='text-sm text-muted-foreground'>No matches yet.</p>
        ) : (
          <Tabs defaultValue={log.matches[0].id}>
            <div className='overflow-x-auto tab-scroll-fade'>
              <TabsList className='w-fit'>
                {log.matches.map((m) => (
                  <TabsTrigger key={m.id} value={m.id} className='font-mono whitespace-nowrap'>
                    {m.teamA.alpha3} {m.teamA.flag} : {m.teamB.flag} {m.teamB.alpha3}
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
