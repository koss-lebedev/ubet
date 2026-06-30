'use strict'

const Autobase = require('autobase')
const Hyperbee = require('hyperbee')
const Corestore = require('corestore')
const b4a = require('b4a')
const { verify } = require('./commit-reveal.js')

function viewValue (node) {
  return node ? node.value : null
}

class PredictionLog {
  constructor ({ storeDir, store, bootstrap = null }) {
    this.store = store || new Corestore(storeDir)
    this._onUpdate = () => {}
    this.base = new Autobase(this.store, bootstrap, {
      valueEncoding: 'json',
      ackInterval: 1000,
      open: (store) => new Hyperbee(store.get('view'), { keyEncoding: 'utf-8', valueEncoding: 'json', extension: false }),
      apply: this._apply.bind(this)
    })
  }

  async ready () {
    await this.base.ready()
    this.base.on('update', () => this._onUpdate())
    return this
  }

  get key () { return b4a.toString(this.base.key, 'hex') }
  get localWriterKey () { return b4a.toString(this.base.local.key, 'hex') }
  get writable () { return this.base.writable }
  get isHost () { return b4a.equals(this.base.local.key, this.base.key) }

  async _apply (nodes, view, host) {
    for (const node of nodes) {
      const v = node.value
      if (!v || typeof v.type !== 'string') continue
      const from = b4a.toString(node.from.key, 'hex')
      const hostKey = viewValue(await view.get('meta/host'))

      if (v.type === 'init') {
        await view.put('meta/host', v.host)
      } else if (v.type === 'add-writer') {
        await host.addWriter(b4a.from(v.key, 'hex'), { indexer: true })
        await view.put('writer/' + v.key, { name: v.name })
      } else if (v.type === 'add-match') {
        if (from !== hostKey) continue
        if (viewValue(await view.get('match/' + v.id)) !== null) continue
        await view.put('match/' + v.id, { id: v.id, teamA: v.teamA, teamB: v.teamB, status: 'open', createdAt: v.createdAt })
      } else if (v.type === 'commit') {
        const match = viewValue(await view.get('match/' + v.matchId))
        if (!match || match.status !== 'open') continue
        await view.put('pred/' + v.matchId + '/' + from, { matchId: v.matchId, author: from, authorName: v.name, hash: v.hash, status: 'committed' })
      } else if (v.type === 'lock') {
        if (from !== hostKey) continue
        const match = viewValue(await view.get('match/' + v.matchId))
        if (!match) continue
        await view.put('match/' + v.matchId, { ...match, status: 'locked' })
      } else if (v.type === 'reveal') {
        const match = viewValue(await view.get('match/' + v.matchId))
        const pred = viewValue(await view.get('pred/' + v.matchId + '/' + from))
        if (!match || match.status !== 'locked' || !pred || pred.author !== from) continue
        const ok = verify(v.score, v.nonce, pred.hash)
        await view.put('pred/' + v.matchId + '/' + from, { ...pred, status: ok ? 'revealed' : 'invalid', score: ok ? v.score : pred.score })
      }
    }
  }

  async createInit () { await this.base.append({ type: 'init', host: this.localWriterKey }) }
  async addWriter (keyHex, name) { await this.base.append({ type: 'add-writer', key: keyHex, name }) }
  async addMatch (id, teamA, teamB, createdAt) { await this.base.append({ type: 'add-match', id, teamA, teamB, createdAt }) }
  async commit (matchId, hash, name) { await this.base.append({ type: 'commit', matchId, hash, name }) }
  async lockMatch (matchId) { await this.base.append({ type: 'lock', matchId }) }
  async reveal (matchId, score, nonce) { await this.base.append({ type: 'reveal', matchId, score, nonce }) }

  onUpdate (cb) { this._onUpdate = cb }
  replicate (stream) { return this.base.replicate(stream) }
  async update () { await this.base.update() }

  async snapshot () {
    const host = viewValue(await this.base.view.get('meta/host'))
    const matches = []
    for await (const { value } of this.base.view.createReadStream({ gte: 'match/', lt: 'match0' })) {
      matches.push(value)
    }
    matches.sort((a, b) => a.createdAt - b.createdAt)
    const predictions = {}
    for await (const { value } of this.base.view.createReadStream({ gte: 'pred/', lt: 'pred0' })) {
      if (!predictions[value.matchId]) predictions[value.matchId] = []
      predictions[value.matchId].push({ author: value.author, authorName: value.authorName, status: value.status, score: value.score })
    }
    return { matches, predictions, host, isHost: this.isHost, writable: this.writable }
  }

  async close () {
    await this.base.close()
    await this.store.close()
  }
}

async function createLog (storeDir) {
  const log = new PredictionLog({ storeDir })
  await log.ready()
  await log.createInit()
  return log
}

async function openLog (storeDir, keyHex) {
  const log = new PredictionLog({ storeDir, bootstrap: b4a.from(keyHex, 'hex') })
  await log.ready()
  return log
}

module.exports = { PredictionLog, createLog, openLog }
