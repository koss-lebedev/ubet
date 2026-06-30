import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            In the room
            <span className="flex gap-2">
              <Badge variant={log.status === 'connected' ? 'default' : 'secondary'}>{log.status}</Badge>
              <Badge variant={log.phase === 'locked' ? 'destructive' : 'secondary'}>{log.phase}</Badge>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Room key (share this to invite)</Label>
            <p className="font-mono text-xs break-all rounded-md bg-muted p-2">{roomKey}</p>
            <Button size="sm" variant="secondary" onClick={copy}>Copy</Button>
          </div>

          {log.phase === 'open' && log.writable ? (
            <div className="space-y-2">
              <Label htmlFor="pick">Your secret pick</Label>
              <Input id="pick" placeholder="e.g. 2-1" value={pick} onChange={(e) => setPick(e.target.value)} />
              <Button className="w-full" onClick={commit}>Commit pick</Button>
            </div>
          ) : null}

          {log.phase === 'open' && !log.writable ? (
            <p className="text-sm text-muted-foreground">Waiting to be admitted to the room…</p>
          ) : null}

          {log.isHost && log.phase === 'open' ? (
            <Button className="w-full" variant="outline" onClick={() => send({ cmd: 'lock' })}>
              Lock room &amp; start reveal
            </Button>
          ) : null}

          <div className="space-y-2">
            <Label>Predictions</Label>
            <ul className="space-y-2">
              {log.predictions.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-md bg-accent px-3 py-2 text-sm">
                  <span>
                    {p.authorName}
                    {p.status === 'revealed' ? <span className="font-mono"> — {p.pick}</span> : null}
                  </span>
                  <Badge variant={STATUS_VARIANT[p.status]}>{p.status}</Badge>
                </li>
              ))}
              {log.predictions.length === 0 ? (
                <li className="text-sm text-muted-foreground">No predictions yet.</li>
              ) : null}
            </ul>
          </div>

          <Button className="w-full" variant="outline" onClick={() => send({ cmd: 'leave-room' })}>Leave</Button>
        </CardContent>
      </Card>
    </div>
  )
}
