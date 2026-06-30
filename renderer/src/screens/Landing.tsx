import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { send } from '@/lib/bridge'

const HEX64 = /^[0-9a-fA-F]{64}$/

export function Landing({ error, onError }: { error: string; onError: (m: string) => void }) {
  const [name, setName] = useState('')
  const [key, setKey] = useState('')

  function create() {
    if (!name.trim()) {
      onError('Enter a display name')
      return
    }
    onError('')
    send({ cmd: 'create-room', name: name.trim() })
  }

  function join() {
    if (!name.trim()) {
      onError('Enter a display name')
      return
    }
    if (!HEX64.test(key.trim())) {
      onError('Room key must be 64 hex characters')
      return
    }
    onError('')
    send({ cmd: 'join-room', name: name.trim(), key: key.trim() })
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Pear Prediction Pool</CardTitle>
          <CardDescription>Create a room and share the key, or join one.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Your display name</Label>
            <Input id="name" placeholder="e.g. Kostya" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button className="w-full" onClick={create}>
            Create room
          </Button>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="join-key">Join with a room key</Label>
            <Input id="join-key" placeholder="64-character room key" value={key} onChange={(e) => setKey(e.target.value)} />
          </div>
          <Button className="w-full" variant="secondary" onClick={join}>
            Join room
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}
