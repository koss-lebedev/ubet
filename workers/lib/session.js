'use strict'

const { isBare } = require('which-runtime')
const { promises: fs } = isBare ? require('bare-fs') : require('fs')
const path = isBare ? require('bare-path') : require('path')
const Hyperswarm = require('hyperswarm')
const Protomux = require('protomux')
const c = require('compact-encoding')
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

function matchesToReveal (secretMatchIds, matches, revealed) {
  const ids = new Set(secretMatchIds)
  return matches
    .filter((m) => m.status === 'locked' && ids.has(m.id) && !revealed.has(m.id))
    .map((m) => m.id)
}

class Session {
  constructor ({ log, name, storeDir }) {
    this.log = log
    this.name = name
    this.storeDir = storeDir
    this._secretsPath = path.join(storeDir, 'secrets.json')
    this.swarm = new Hyperswarm()
    this.secrets = new Map() // matchId -> { a, b, nonce }
    this._revealed = new Set() // matchIds we have already appended a reveal for
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

  async addMatch (teamA, teamB) {
    const id = randomNonce().slice(0, 16)
    await this.log.addMatch(id, teamA.code, teamB.code, Date.now())
  }

  async commit (matchId, a, b) {
    const score = a + '-' + b
    const nonce = randomNonce()
    this.secrets.set(matchId, { a, b, nonce })
    await this.log.commit(matchId, commitHash(score, nonce), this.name)
    try {
      await saveSecrets(this._secretsPath, this.secrets)
    } catch (err) {
      console.error('Failed to persist secrets:', err)
    }
  }

  async lockMatch (matchId) { await this.log.lockMatch(matchId) }

  onState (cb) { this._onState = cb; this._emit() }

  async _emit () {
    const snap = await this.log.snapshot()
    for (const matchId of matchesToReveal([...this.secrets.keys()], snap.matches, this._revealed)) {
      this._revealed.add(matchId)
      const secret = this.secrets.get(matchId)
      try {
        await this.log.reveal(matchId, secret.a + '-' + secret.b, secret.nonce)
      } catch (err) {
        this._revealed.delete(matchId)
        console.error(err)
      }
    }
    const mine = {}
    for (const [matchId, secret] of this.secrets) mine[matchId] = { a: secret.a, b: secret.b }
    this._onState({ ...snap, mine, status: this._status })
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

module.exports = { Session, createSession, joinSession, matchesToReveal, saveSecrets, loadSecrets }
