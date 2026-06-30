import { useEffect, useState } from 'react'
import { startWorker, onEvent, send, type LogState, type RoomEntry } from '@/lib/bridge'
import { Landing } from '@/screens/Landing'
import { Room } from '@/screens/Room'

const EMPTY: LogState = {
  matches: [],
  predictions: {},
  mine: {},
  host: null,
  isHost: false,
  writable: false,
  status: 'connecting'
}

export default function App() {
  const [screen, setScreen] = useState<'landing' | 'room'>('landing')
  const [roomKey, setRoomKey] = useState('')
  const [log, setLog] = useState<LogState>(EMPTY)
  const [error, setError] = useState('')
  const [rooms, setRooms] = useState<RoomEntry[]>([])

  useEffect(() => {
    startWorker()
    send({ cmd: 'list-rooms' })
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
          send({ cmd: 'list-rooms' })
          break
        case 'rooms-list':
          setRooms(e.rooms)
          break
        case 'error':
          setError(e.message)
          break
      }
    })
    return off
  }, [])

  return screen === 'landing' ? (
    <Landing error={error} onError={setError} rooms={rooms} />
  ) : (
    <Room roomKey={roomKey} log={log} />
  )
}
