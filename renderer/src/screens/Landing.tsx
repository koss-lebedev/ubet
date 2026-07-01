import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { send, type RoomEntry } from '@/lib/bridge'

const HEX64 = /^[0-9a-fA-F]{64}$/

export function Landing({
  error,
  onError,
  rooms
}: {
  error: string
  onError: (m: string) => void
  rooms: RoomEntry[]
}) {
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const hasRooms = rooms.length > 0

  useEffect(() => {
    if (error) setPendingAction(null)
  }, [error])

  function create() {
    if (!name.trim()) {
      onError('Enter a display name')
      return
    }
    onError('')
    setPendingAction('create')
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
    setPendingAction('join')
    send({ cmd: 'join-room', name: name.trim(), key: key.trim() })
  }

  function rejoin(room: RoomEntry) {
    onError('')
    setPendingAction(`rejoin:${room.storeDir}`)
    send({ cmd: 'rejoin-room', storeDir: room.storeDir, key: room.key, name: room.name })
  }

  return (
    <div className='fixed inset-0 flex items-center justify-center landing-glow p-6 backdrop-blur-sm'>
      <Card className='w-full max-w-md shadow-2xl'>
        <CardHeader>
          <CardTitle>Pear Prediction Pool</CardTitle>
          <CardDescription>Create a room and share the key, or join one.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <Tabs defaultValue={hasRooms ? 'resume' : 'create'}>
            <TabsList className='w-full'>
              {hasRooms ? <TabsTrigger value='resume'>Resume</TabsTrigger> : null}
              <TabsTrigger value='create'>Create</TabsTrigger>
              <TabsTrigger value='join'>Join</TabsTrigger>
            </TabsList>

            {hasRooms ? (
              <TabsContent value='resume' className='space-y-2'>
                <ul className='space-y-1'>
                  {rooms.map((room) => (
                    <li key={room.storeDir}>
                      <Button
                        className='w-full justify-between font-mono text-xs'
                        variant='ghost'
                        disabled={pendingAction !== null}
                        onClick={() => rejoin(room)}
                      >
                        {pendingAction === `rejoin:${room.storeDir}` ? (
                          <Loader2 className='size-4 animate-spin' />
                        ) : (
                          <span>{room.key.slice(0, 8)}…</span>
                        )}
                        <span className='text-muted-foreground font-sans'>
                          {room.name} · {new Date(room.createdAt).toLocaleDateString()}
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </TabsContent>
            ) : null}

            <TabsContent value='create' className='space-y-4'>
              <div className='space-y-2'>
                <Label htmlFor='name-create'>Your display name</Label>
                <Input
                  id='name-create'
                  placeholder='e.g. Kostya'
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <Button className='w-full' disabled={pendingAction !== null} onClick={create}>
                {pendingAction === 'create' ? <Loader2 className='size-4 animate-spin' /> : null}
                Create room
              </Button>
            </TabsContent>

            <TabsContent value='join' className='space-y-4'>
              <div className='space-y-2'>
                <Label htmlFor='name-join'>Your display name</Label>
                <Input
                  id='name-join'
                  placeholder='e.g. Kostya'
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='join-key'>Room key</Label>
                <Input
                  id='join-key'
                  placeholder='64-character room key'
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
              </div>
              <Button className='w-full' disabled={pendingAction !== null} onClick={join}>
                {pendingAction === 'join' ? <Loader2 className='size-4 animate-spin' /> : null}
                Join room
              </Button>
            </TabsContent>
          </Tabs>
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}
