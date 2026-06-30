const PearRuntime = require('pear-runtime')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const goodbye = require('graceful-goodbye')
const FramedStream = require('framed-stream')
const path = require('bare-path')

const { createSession, joinSession } = require('./lib/session.js')

const pipe = new FramedStream(Bare.IPC)

let session = null

function sendEvent (obj) {
  pipe.write(JSON.stringify(obj))
}

function roomsDir () {
  return path.join(updaterConfig.dir, 'rooms')
}

async function stopSession () {
  if (session) {
    try { await session.close() } catch (err) { console.error(err) }
    session = null
  }
}

function wireState () {
  session.onState((s) => sendEvent({
    evt: 'log-state',
    phase: s.phase,
    host: s.host,
    isHost: s.isHost,
    writable: s.writable,
    status: s.status,
    predictions: s.predictions
  }))
}

const updaterConfig = {
  dir: Bare.argv[2],
  app: Bare.argv[3],
  updates: Bare.argv[4] !== 'false',
  version: Bare.argv[5],
  upgrade: Bare.argv[6],
  name: Bare.argv[7]
}

const store = new Corestore(path.join(updaterConfig.dir, 'pear-runtime/corestore'))
const swarm = new Hyperswarm()
const pear = new PearRuntime({ ...updaterConfig, swarm, store })

pear.updater.on('error', console.error)
if (updaterConfig.updates !== false) {
  swarm.on('connection', (connection) => store.replicate(connection))
  swarm.join(pear.updater.drive.core.discoveryKey, {
    client: true,
    server: false
  })
}

console.log('Application storage:', pear.storage)

pear.updater.on('updating', () => pipe.write('updating'))
pear.updater.on('updated', () => pipe.write('updated'))

goodbye(async () => {
  await stopSession()
  await swarm.destroy()
  await pear.close()
  await store.close()
})

pipe.on('data', async (data) => {
  const text = data.toString()

  let msg = null
  try { msg = JSON.parse(text) } catch { msg = null }

  if (!msg || typeof msg.cmd !== 'string') {
    if (text === 'pear:applyUpdate') {
      await pear.updater.applyUpdate()
      pipe.write('pear:updateApplied')
    } else {
      console.log(text)
    }
    return
  }

  try {
    if (msg.cmd === 'create-room') {
      await stopSession()
      session = await createSession({ name: msg.name, storeDir: path.join(roomsDir(), 'host-' + Date.now()) })
      wireState()
      await session.start()
      sendEvent({ evt: 'room-ready', key: session.key })
    } else if (msg.cmd === 'join-room') {
      await stopSession()
      session = await joinSession({ name: msg.name, key: msg.key, storeDir: path.join(roomsDir(), msg.key) })
      wireState()
      await session.start()
      sendEvent({ evt: 'room-ready', key: session.key })
    } else if (msg.cmd === 'leave-room') {
      await stopSession()
      sendEvent({ evt: 'room-left' })
    } else if (msg.cmd === 'commit') {
      if (session) await session.commit(msg.pick)
    } else if (msg.cmd === 'lock') {
      if (session) await session.lock()
    } else if (msg.cmd === 'reveal') {
      if (session) await session.reveal(msg.id)
    }
  } catch (err) {
    sendEvent({ evt: 'error', message: err.message })
  }
})

pipe.write('Hello from worker')
