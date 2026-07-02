import { useEffect, useState } from 'react'
import {
  startWorker,
  onEvent,
  send,
  listIdentities,
  type Identity,
  type LogState,
  type TournamentEntry
} from '@/lib/bridge'
import { Landing } from '@/screens/Landing'
import { Tournament } from '@/screens/Tournament'
import { IdentitySetup } from '@/screens/IdentitySetup'

const EMPTY: LogState = {
  matches: [],
  predictions: {},
  messages: {},
  participants: {},
  mine: {},
  host: null,
  isHost: false,
  writable: false,
  localAuthor: '',
  status: 'connecting'
}

export default function App() {
  const [screen, setScreen] = useState<'setup' | 'landing' | 'tournament'>('landing')
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [tournamentKey, setTournamentKey] = useState('')
  const [log, setLog] = useState<LogState>(EMPTY)
  const [error, setError] = useState('')
  const [tournaments, setTournaments] = useState<TournamentEntry[]>([])

  useEffect(() => {
    startWorker()
    send({ cmd: 'list-tournaments' })
    listIdentities()
      .then((l) => {
        const active = l.active ? (l.identities.find((i) => i.address === l.active) ?? null) : null
        setIdentity(active)
        if (!active || !active.name) setScreen('setup')
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load identities'))
    const off = onEvent((e) => {
      switch (e.evt) {
        case 'tournament-ready':
          setTournamentKey(e.key)
          setScreen('tournament')
          break
        case 'log-state':
          setLog(e)
          break
        case 'tournament-left':
          setScreen('landing')
          setLog(EMPTY)
          send({ cmd: 'list-tournaments' })
          break
        case 'tournaments-list':
          setTournaments(e.tournaments)
          break
        case 'error':
          setError(e.message)
          break
      }
    })
    return off
  }, [])

  if (screen === 'setup') {
    return (
      <IdentitySetup
        onDone={(id) => {
          setIdentity(id)
          setScreen('landing')
        }}
      />
    )
  }

  if (screen === 'tournament') {
    return <Tournament tournamentKey={tournamentKey} log={log} />
  }

  return (
    <Landing
      error={error}
      onError={setError}
      identity={identity}
      tournaments={tournaments}
      onManageIdentity={() => setScreen('setup')}
    />
  )
}
