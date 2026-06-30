'use strict'

const { promises: fs } = require('fs')
const path = require('path')
const Hyperswarm = require('hyperswarm')
const Protomux = require('protomux')
const c = require('compact-encoding')
const b4a = require('b4a')
const { Room } = require('./room.js')
const { createLog, openLog } = require('./prediction-log.js')
const { randomNonce, commitHash } = require('./commit-reveal.js')

const CONTROL_PROTOCOL = 'ubet/control/1'

async function saveSecrets (secretsPath, secrets) {
  const obj = {}
  for (const [id, secret] of secrets) obj[id] = secret
  await fs.writeFile(secretsPath, JSON.stringify(obj), 'utf-8')
}

async function loadSecrets (secretsPath, secrets) {
  try {
    const data = JSON.parse(await fs.readFile(secretsPath, 'utf-8'))
    for (const [id, secret] of Object.entries(data)) secrets.set(id, secret)
  } catch {}
}

function predictionsToReveal (secretIds, predictions) {
  const ids = new Set(secretIds)
  return predictions.filter((p) => p.status === 'committed' && ids.has(p.id)).map((p) => p.id)
}

class Session {
  constructor ({ log, name, storeDir }) {
    this.log = log
    this.name = name
    this.storeDir = storeDir
    this._secretsPath = path.join(storeDir, 'secrets.json')
    this.swarm = new Hyperswarm()
    this.secrets = new Map() // id -> { pick, nonce }
    this._revealed = new Set() // ids we have already appended a reveal for
    this._status = 'connecting'
    this._onState = () => {}
    this.room = new Room({
      swarm: this.swarm,
      onStatus: (s) => { this._status = s; this._emit() },
      onConnection: (conn) => this._onConnection(conn)
    })
    this.log.onUpdate(() => this._emit())
  }

  get key () { return this.log.key }

  async start () {
    await loadSecrets(this._secretsPath, this.secrets)
    await this.room.join(this.log.key)
    return this
  }

  _onConnection (conn) {
    this.log.replicate(conn)
    const mux = Protomux.from(conn)
    const channel = mux.createChannel({ protocol: CONTROL_PROTOCOL })
    const message = channel.addMessage({
      encoding: c.string,
      onmessage: async (str) => {
        let peer
        try { peer = JSON.parse(str) } catch { return }
        if (this.log.isHost && peer.key && peer.key !== this.log.localWriterKey) {
          try { await this.log.addWriter(peer.key, peer.name) } catch {}
        }
      }
    })
    channel.open()
    message.send(JSON.stringify({ key: this.log.localWriterKey, name: this.name }))
  }

  async commit (pick) {
    const id = randomNonce().slice(0, 16)
    const nonce = randomNonce()
    this.secrets.set(id, { pick, nonce })
    await this.log.commit(id, commitHash(pick, nonce), this.name)
    try {
      await saveSecrets(this._secretsPath, this.secrets)
    } catch (err) {
      console.error('Failed to persist secrets:', err)
    }
  }

  async lock () { await this.log.lock() }

  async reveal (id) {
    const secret = this.secrets.get(id)
    if (!secret) throw new Error('No saved secret for this prediction (committed elsewhere or lost on restart)')
    await this.log.reveal(id, secret.pick, secret.nonce)
  }

  onState (cb) { this._onState = cb; this._emit() }

  async _emit () {
    const snap = await this.log.snapshot()
    if (snap.phase === 'locked') {
      for (const id of predictionsToReveal([...this.secrets.keys()], snap.predictions)) {
        if (this._revealed.has(id)) continue
        this._revealed.add(id)
        const secret = this.secrets.get(id)
        try {
          await this.log.reveal(id, secret.pick, secret.nonce)
        } catch (err) {
          this._revealed.delete(id)
          console.error(err)
        }
      }
    }
    this._onState({ ...snap, status: this._status })
  }

  async close () {
    try { await this.room.leave() } catch {}
    try { await this.swarm.destroy() } catch {}
    try { await this.log.close() } catch {}
  }
}

async function createSession ({ name, storeDir }) {
  const log = await createLog(storeDir)
  return new Session({ log, name, storeDir })
}

async function joinSession ({ name, key, storeDir }) {
  const log = await openLog(storeDir, key)
  return new Session({ log, name, storeDir })
}

module.exports = { Session, createSession, joinSession, predictionsToReveal, saveSecrets, loadSecrets }
