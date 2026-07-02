import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar } from '@/components/Avatar'
import { shortAddress } from '@/lib/identicon'
import { setName as setNameRpc, restoreIdentity, exportRecovery, type Identity } from '@/lib/bridge'

export function IdentitySetup({
  identity,
  onDone
}: {
  identity: Identity | null
  onDone: (id: Identity) => void
}) {
  const [id, setId] = useState<Identity | null>(identity)
  const [name, setName] = useState(identity?.name ?? '')
  const [phrase, setPhrase] = useState('')
  const [recovery, setRecovery] = useState('')
  const [mode, setMode] = useState<'main' | 'restore'>('main')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const address = id?.address ?? identity?.address ?? null

  async function save() {
    if (!name.trim()) {
      setError('Enter a display name')
      return
    }
    setError('')
    setBusy(true)
    try {
      const next = await setNameRpc(name.trim())
      onDone(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save name')
    } finally {
      setBusy(false)
    }
  }

  async function reveal() {
    setError('')
    try {
      setRecovery(await exportRecovery())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read recovery phrase')
    }
  }

  async function restore() {
    setError('')
    setBusy(true)
    try {
      const next = await restoreIdentity(phrase.trim())
      setId(next)
      setName(next.name)
      setPhrase('')
      setRecovery('')
      setMode('main')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid recovery phrase')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className='fixed inset-0 flex items-center justify-center landing-glow p-6 backdrop-blur-sm'>
      <Card className='w-full max-w-md shadow-2xl'>
        <CardHeader>
          <CardTitle>Your identity</CardTitle>
          <CardDescription>
            A self-custodial wallet is your identity across every tournament. Pick a display name
            and back up your recovery phrase.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='flex items-center gap-3 rounded-md border p-3'>
            {address ? <Avatar seed={address} size={40} /> : null}
            <div className='min-w-0'>
              <p className='text-sm font-medium'>{name.trim() || 'Unnamed'}</p>
              <p className='text-muted-foreground truncate font-mono text-xs'>
                {shortAddress(address)}
              </p>
            </div>
          </div>

          {mode === 'main' ? (
            <>
              <div className='space-y-2'>
                <Label htmlFor='identity-name'>Display name</Label>
                <Input
                  id='identity-name'
                  placeholder='e.g. Kostya'
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <Button className='w-full' disabled={busy} onClick={save}>
                {busy ? <Loader2 className='size-4 animate-spin' /> : null}
                Continue
              </Button>

              {recovery ? (
                <div className='space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-3'>
                  <p className='text-xs font-semibold text-amber-400'>
                    Write this down. Anyone with it controls your identity.
                  </p>
                  <p className='font-mono text-sm break-words select-all'>{recovery}</p>
                </div>
              ) : (
                <Button variant='ghost' className='w-full' onClick={reveal}>
                  Back up recovery phrase
                </Button>
              )}
              <Button variant='ghost' className='w-full' onClick={() => setMode('restore')}>
                Restore from a recovery phrase
              </Button>
            </>
          ) : (
            <>
              <div className='space-y-2'>
                <Label htmlFor='restore-phrase'>Recovery phrase</Label>
                <Input
                  id='restore-phrase'
                  placeholder='24-word recovery phrase'
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                />
              </div>
              <Button className='w-full' disabled={busy || !phrase.trim()} onClick={restore}>
                {busy ? <Loader2 className='size-4 animate-spin' /> : null}
                Restore identity
              </Button>
              <Button variant='ghost' className='w-full' onClick={() => setMode('main')}>
                Back
              </Button>
            </>
          )}

          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}
