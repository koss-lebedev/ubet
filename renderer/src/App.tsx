import { useEffect, useState } from 'react'
import { startWorker, onEvent, type LogState } from '@/lib/bridge'
import { Landing } from '@/screens/Landing'
import { Room } from '@/screens/Room'

const EMPTY: LogState = {
  phase: 'open', host: null, isHost: false, writable: false,
  status: 'connecting', predictions: []
}

export default function App() {
  const [screen, setScreen] = useState<'landing' | 'room'>('landing')
  const [roomKey, setRoomKey] = useState('')
  const [log, setLog] = useState<LogState>(EMPTY)
  const [error, setError] = useState('')

  useEffect(() => {
    startWorker()
    const off = onEvent((e) => {
      switch (e.evt) {
        case 'room-ready':
          setRoomKey(e.key)
          setScreen('room')
          break
        case 'log-state':
          setLog(e)
          break
        case 'room-left':
          setScreen('landing')
          setLog(EMPTY)
          break
        case 'error':
          setError(e.message)
          break
      }
    })
    return off
  }, [])

  return screen === 'landing' ? (
    <Landing error={error} onError={setError} />
  ) : (
    <Room roomKey={roomKey} log={log} />
  )
}
