import { useEffect, useState } from 'react'
import { Loader2, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar } from '@/components/Avatar'
import { shortAddress } from '@/lib/identicon'
import {
  listIdentities,
  createIdentity,
  selectIdentity,
  setName as setNameRpc,
  restoreIdentity,
  exportRecovery,
  type Identity,
  type IdentityList
} from '@/lib/bridge'

export function IdentitySetup({ onDone }: { onDone: (id: Identity) => void }) {
  const [list, setList] = useState<IdentityList | null>(null)
  const [mode, setMode] = useState<'choose' | 'name'>('choose')
  const [current, setCurrent] = useState<Identity | null>(null)
  const [name, setName] = useState('')
  const [phrase, setPhrase] = useState('')
  const [showRestore, setShowRestore] = useState(false)
  const [recovery, setRecovery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    try {
      setList(await listIdentities())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load identities')
    }
  }
  useEffect(() => {
    refresh()
  }, [])

  function fail(e: unknown, fallback: string) {
    setError(e instanceof Error ? e.message : fallback)
  }
  function toName(id: Identity) {
    setCurrent(id)
    setName(id.name)
    setRecovery('')
    setMode('name')
  }

  async function choose(id: Identity) {
    setError('')
    setBusy(true)
    try {
      const active = await selectIdentity(id.address)
      if (active.name) onDone(active)
      else toName(active)
    } catch (e) {
      fail(e, 'Failed to select identity')
    } finally {
      setBusy(false)
    }
  }

  async function edit(id: Identity) {
    setError('')
    setBusy(true)
    try {
      toName(await selectIdentity(id.address))
    } catch (e) {
      fail(e, 'Failed to open identity')
    } finally {
      setBusy(false)
    }
  }

  async function create() {
    setError('')
    setBusy(true)
    try {
      toName(await createIdentity())
    } catch (e) {
      fail(e, 'Failed to create identity')
    } finally {
      setBusy(false)
    }
  }

  async function restore() {
    setError('')
    setBusy(true)
    try {
      const active = await restoreIdentity(phrase.trim())
      setPhrase('')
      setShowRestore(false)
      if (active.name) onDone(active)
      else toName(active)
    } catch (e) {
      fail(e, 'Invalid recovery phrase')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!name.trim()) {
      setError('Enter a display name')
      return
    }
    setError('')
    setBusy(true)
    try {
      onDone(await setNameRpc(name.trim()))
    } catch (e) {
      fail(e, 'Failed to save name')
    } finally {
      setBusy(false)
    }
  }

  async function reveal() {
    setError('')
    try {
      setRecovery(await exportRecovery())
    } catch (e) {
      fail(e, 'Failed to read recovery phrase')
    }
  }

  return (
    <div className='fixed inset-0 flex items-center justify-center landing-glow p-6 backdrop-blur-sm'>
      <Card className='w-full max-w-md shadow-2xl'>
        {mode === 'choose' ? (
          <>
            <CardHeader>
              <CardTitle>Choose an identity</CardTitle>
              <CardDescription>
                Pick an existing identity or create a new one. Each identity is a self-custodial
                wallet, recognizable across every tournament.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {list && list.identities.length > 0 ? (
                <ul className='space-y-1'>
                  {list.identities.map((id) => (
                    <li key={id.address} className='flex items-center gap-1'>
                      <button
                        type='button'
                        disabled={busy}
                        onClick={() => choose(id)}
                        className='hover:bg-muted flex flex-1 items-center gap-2 rounded-md border px-3 py-2 text-left disabled:opacity-50'
                      >
                        <Avatar seed={id.address} size={28} />
                        <span className='min-w-0 flex-1'>
                          <span className='block truncate text-sm font-medium'>
                            {id.name || 'Unnamed'}
                          </span>
                          <span className='text-muted-foreground block truncate font-mono text-xs'>
                            {shortAddress(id.address)}
                          </span>
                        </span>
                        {id.address === list.active ? (
                          <span className='text-muted-foreground text-xs'>current</span>
                        ) : null}
                      </button>
                      <Button
                        size='icon'
                        variant='ghost'
                        disabled={busy}
                        title='Rename / recovery phrase'
                        onClick={() => edit(id)}
                      >
                        <Pencil className='size-4' />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='text-muted-foreground text-sm'>No identities yet.</p>
              )}

              <Button className='w-full' disabled={busy} onClick={create}>
                {busy ? <Loader2 className='size-4 animate-spin' /> : <Plus className='size-4' />}
                Create new identity
              </Button>

              {showRestore ? (
                <div className='space-y-2'>
                  <Label htmlFor='restore-phrase'>Recovery phrase</Label>
                  <Input
                    id='restore-phrase'
                    placeholder='24-word recovery phrase'
                    value={phrase}
                    onChange={(e) => setPhrase(e.target.value)}
                  />
                  <div className='flex gap-2'>
                    <Button className='flex-1' disabled={busy || !phrase.trim()} onClick={restore}>
                      {busy ? <Loader2 className='size-4 animate-spin' /> : null}
                      Restore
                    </Button>
                    <Button
                      variant='ghost'
                      onClick={() => {
                        setShowRestore(false)
                        setPhrase('')
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant='ghost' className='w-full' onClick={() => setShowRestore(true)}>
                  Restore from a recovery phrase
                </Button>
              )}
              {error ? <p className='text-destructive text-sm'>{error}</p> : null}
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Name your identity</CardTitle>
              <CardDescription>
                Choose a display name and back up your recovery phrase.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='flex items-center gap-3 rounded-md border p-3'>
                {current?.address ? <Avatar seed={current.address} size={40} /> : null}
                <div className='min-w-0'>
                  <p className='text-sm font-medium'>{name.trim() || 'Unnamed'}</p>
                  <p className='text-muted-foreground truncate font-mono text-xs'>
                    {shortAddress(current?.address ?? null)}
                  </p>
                </div>
              </div>

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
                    Write this down. Anyone with it controls this identity.
                  </p>
                  <p className='font-mono text-sm break-words select-all'>{recovery}</p>
                </div>
              ) : (
                <Button variant='ghost' className='w-full' onClick={reveal}>
                  Back up recovery phrase
                </Button>
              )}
              <Button
                variant='ghost'
                className='w-full'
                onClick={() => {
                  setRecovery('')
                  setError('')
                  setMode('choose')
                  refresh()
                }}
              >
                Back
              </Button>
              {error ? <p className='text-destructive text-sm'>{error}</p> : null}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}
