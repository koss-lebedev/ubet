import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { send, type LogState, type Prediction } from '@/lib/bridge'

const STATUS_VARIANT: Record<Prediction['status'], 'secondary' | 'default' | 'destructive'> = {
  committed: 'secondary',
  revealed: 'default',
  invalid: 'destructive'
}

export function Room({ roomKey, log }: { roomKey: string; log: LogState }) {
  const [pick, setPick] = useState('')

  async function copy() {
    try {
      await navigator.clipboard.writeText(roomKey)
      toast('Room key copied')
    } catch {
      toast('Copy failed')
    }
  }

  function commit() {
    if (!pick.trim()) return
    send({ cmd: 'commit', pick: pick.trim() })
    setPick('')
  }

  return (
    <div className='flex h-screen'>
      <aside className='flex w-80 flex-col gap-4 overflow-y-auto border-r p-4'>
        <div className='flex gap-2'>
          <Badge variant={log.status === 'connected' ? 'default' : 'secondary'}>{log.status}</Badge>
          <Badge variant={log.phase === 'locked' ? 'destructive' : 'secondary'}>{log.phase}</Badge>
        </div>

        <div className='space-y-2'>
          <Label>Room key (share this to invite)</Label>
          <p className='font-mono text-xs break-all rounded-md bg-muted p-2'>{roomKey}</p>
          <Button size='sm' variant='secondary' onClick={copy}>
            Copy
          </Button>
        </div>

        {log.phase === 'open' && log.writable ? (
          <div className='space-y-2'>
            <Label htmlFor='pick'>Your secret pick</Label>
            <Input
              id='pick'
              placeholder='e.g. 2-1'
              value={pick}
              onChange={(e) => setPick(e.target.value)}
            />
            <Button className='w-full' onClick={commit}>
              Commit pick
            </Button>
          </div>
        ) : null}

        {log.phase === 'open' && !log.writable ? (
          <p className='text-sm text-muted-foreground'>Waiting to be admitted to the room…</p>
        ) : null}

        {log.isHost && log.phase === 'open' ? (
          <Button className='w-full' variant='outline' onClick={() => send({ cmd: 'lock' })}>
            Lock room &amp; start reveal
          </Button>
        ) : null}

        <Button
          className='mt-auto w-full'
          variant='outline'
          onClick={() => send({ cmd: 'leave-room' })}
        >
          Leave
        </Button>
      </aside>

      <main className='flex-1 overflow-y-auto p-6'>
        <h2 className='mb-4 text-lg font-semibold'>Predictions</h2>
        <ul className='space-y-2'>
          {log.predictions.map((p) => (
            <li
              key={p.id}
              className='flex items-center justify-between gap-2 rounded-md bg-accent px-3 py-2 text-sm'
            >
              <span>
                {p.authorName}
                {p.status === 'revealed' ? <span className='font-mono'> — {p.pick}</span> : null}
              </span>
              <Badge variant={STATUS_VARIANT[p.status]}>{p.status}</Badge>
            </li>
          ))}
          {log.predictions.length === 0 ? (
            <li className='text-sm text-muted-foreground'>No predictions yet.</li>
          ) : null}
        </ul>
      </main>
    </div>
  )
}
