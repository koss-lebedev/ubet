import { useEffect, useState } from 'react'
import { startWorker, onEvent, send, type LogState, type TournamentEntry } from '@/lib/bridge'
import { Landing } from '@/screens/Landing'
import { Tournament } from '@/screens/Tournament'

const EMPTY: LogState = {
  matches: [],
  predictions: {},
  messages: {},
  mine: {},
  host: null,
  isHost: false,
  writable: false,
  localAuthor: '',
  status: 'connecting'
}

export default function App() {
  const [screen, setScreen] = useState<'landing' | 'tournament'>('landing')
  const [tournamentKey, setTournamentKey] = useState('')
  const [log, setLog] = useState<LogState>(EMPTY)
  const [error, setError] = useState('')
  const [tournaments, setTournaments] = useState<TournamentEntry[]>([])

  useEffect(() => {
    startWorker()
    send({ cmd: 'list-tournaments' })
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

  return screen === 'landing' ? (
    <Landing error={error} onError={setError} tournaments={tournaments} />
  ) : (
    <Tournament tournamentKey={tournamentKey} log={log} />
  )
}
