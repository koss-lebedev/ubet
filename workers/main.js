const PearRuntime = require('pear-runtime')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const goodbye = require('graceful-goodbye')
const FramedStream = require('framed-stream')
const path = require('bare-path')
const b4a = require('b4a')
const crypto = require('hypercore-crypto')
const { writeManifest, listManifests } = require('./lib/room-manifest.js')

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
    matches: s.matches,
    predictions: s.predictions,
    messages: s.messages,
    mine: s.mine,
    host: s.host,
    isHost: s.isHost,
    writable: s.writable,
    localAuthor: s.localAuthor,
    status: s.status
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
      const roomId = b4a.toString(crypto.randomBytes(16), 'hex')
      const storeDir = path.join(roomsDir(), roomId)
      session = await createSession({ name: msg.name, storeDir })
      wireState()
      await session.start()
      await writeManifest(storeDir, { key: session.key, name: msg.name })
      sendEvent({ evt: 'room-ready', key: session.key })
    } else if (msg.cmd === 'join-room') {
      await stopSession()
      const storeDir = path.join(roomsDir(), msg.key)
      session = await joinSession({ name: msg.name, key: msg.key, storeDir })
      wireState()
      await session.start()
      await writeManifest(storeDir, { key: msg.key, name: msg.name })
      sendEvent({ evt: 'room-ready', key: session.key })
    } else if (msg.cmd === 'leave-room') {
      await stopSession()
      sendEvent({ evt: 'room-left' })
    } else if (msg.cmd === 'add-match') {
      if (session) await session.addMatch(msg.teamA, msg.teamB)
    } else if (msg.cmd === 'lock-match') {
      if (session) await session.lockMatch(msg.matchId)
    } else if (msg.cmd === 'set-result') {
      if (session) await session.setResult(msg.matchId, msg.a, msg.b)
    } else if (msg.cmd === 'commit') {
      if (session) await session.commit(msg.matchId, msg.a, msg.b)
    } else if (msg.cmd === 'send-message') {
      if (session) await session.sendMessage(msg.matchId, msg.text)
    } else if (msg.cmd === 'list-rooms') {
      const rooms = await listManifests(roomsDir())
      sendEvent({ evt: 'rooms-list', rooms })
    } else if (msg.cmd === 'rejoin-room') {
      await stopSession()
      session = await joinSession({ name: msg.name, key: msg.key, storeDir: msg.storeDir })
      wireState()
      await session.start()
      sendEvent({ evt: 'room-ready', key: session.key })
    }
  } catch (err) {
    sendEvent({ evt: 'error', message: err.message })
  }
})

pipe.write('Hello from worker')
