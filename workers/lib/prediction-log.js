'use strict'

const Autobase = require('autobase')
const Hyperbee = require('hyperbee')
const Corestore = require('corestore')
const b4a = require('b4a')
const { verify } = require('./commit-reveal.js')

const MAX_CHAT_LEN = 2000

function viewValue(node) {
  return node ? node.value : null
}

function padSeq(n) {
  return String(n).padStart(12, '0')
}

async function appendSystemMessage(view, matchId, text, createdAt) {
  const seq = (viewValue(await view.get('meta/chatSeq')) || 0) + 1
  await view.put('meta/chatSeq', seq)
  await view.put('chat/' + matchId + '/' + padSeq(seq), {
    matchId,
    kind: 'system',
    author: '',
    authorName: '',
    text,
    createdAt,
    seq
  })
}

class PredictionLog {
  constructor({ storeDir, store, bootstrap = null }) {
    this.store = store || new Corestore(storeDir)
    this._onUpdate = () => {}
    this.base = new Autobase(this.store, bootstrap, {
      valueEncoding: 'json',
      ackInterval: 1000,
      open: (store) =>
        new Hyperbee(store.get('view'), {
          keyEncoding: 'utf-8',
          valueEncoding: 'json',
          extension: false
        }),
      apply: this._apply.bind(this)
    })
  }

  async ready() {
    await this.base.ready()
    this.base.on('update', () => this._onUpdate())
    return this
  }

  get key() {
    return b4a.toString(this.base.key, 'hex')
  }
  get localWriterKey() {
    return b4a.toString(this.base.local.key, 'hex')
  }
  get writable() {
    return this.base.writable
  }
  get isHost() {
    return b4a.equals(this.base.local.key, this.base.key)
  }

  async _apply(nodes, view, host) {
    for (const node of nodes) {
      const v = node.value
      if (!v || typeof v.type !== 'string') continue
      const from = b4a.toString(node.from.key, 'hex')
      const hostKey = viewValue(await view.get('meta/host'))

      if (v.type === 'init') {
        await view.put('meta/host', v.host)
        await view.put('meta/name', v.name || '')
      } else if (v.type === 'add-writer') {
        await host.addWriter(b4a.from(v.key, 'hex'), { indexer: true })
        const prevW = viewValue(await view.get('writer/' + v.key)) || {}
        await view.put('writer/' + v.key, { ...prevW, name: v.name })
      } else if (v.type === 'identity') {
        // Author-match replay guard: the binding's writerKey must be the entry's
        // actual Autobase author. Signature verification is NOT done here (the
        // reducer can't reach WDK in main) — it is a local per-node concern
        // computed in the Session and merged into participants at snapshot time.
        if (v.writerKey !== from) continue
        const prevW = viewValue(await view.get('writer/' + v.writerKey)) || {}
        await view.put('writer/' + v.writerKey, {
          ...prevW,
          address: v.address,
          name: v.name || '',
          sig: v.sig
        })
      } else if (v.type === 'add-match') {
        if (from !== hostKey) continue
        if (viewValue(await view.get('match/' + v.id)) !== null) continue
        await view.put('match/' + v.id, {
          id: v.id,
          teamA: v.teamA,
          teamB: v.teamB,
          status: 'open',
          createdAt: v.createdAt
        })
      } else if (v.type === 'commit') {
        const match = viewValue(await view.get('match/' + v.matchId))
        if (!match || match.status !== 'open') continue
        await view.put('pred/' + v.matchId + '/' + from, {
          matchId: v.matchId,
          author: from,
          authorName: v.name,
          hash: v.hash,
          status: 'committed',
          committedAt: v.createdAt
        })
      } else if (v.type === 'lock') {
        if (from !== hostKey) continue
        const match = viewValue(await view.get('match/' + v.matchId))
        if (!match) continue
        await view.put('match/' + v.matchId, {
          ...match,
          status: 'locked',
          lockedAt: v.createdAt,
          result: { a: 0, b: 0 }
        })
      } else if (v.type === 'update-score') {
        if (from !== hostKey) continue
        const match = viewValue(await view.get('match/' + v.matchId))
        if (!match || match.status !== 'locked') continue
        await view.put('match/' + v.matchId, { ...match, result: { a: v.a, b: v.b } })
        await appendSystemMessage(view, v.matchId, `Score updated — ${v.a}–${v.b}`, v.createdAt)
      } else if (v.type === 'finish-match') {
        if (from !== hostKey) continue
        const match = viewValue(await view.get('match/' + v.matchId))
        if (!match || match.status !== 'locked') continue
        await view.put('match/' + v.matchId, { ...match, status: 'final', finishedAt: v.createdAt })
        const score = match.result ?? { a: 0, b: 0 }
        await appendSystemMessage(
          view,
          v.matchId,
          `Match finished — final score ${score.a}–${score.b}`,
          v.createdAt
        )
      } else if (v.type === 'chat') {
        const match = viewValue(await view.get('match/' + v.matchId))
        if (!match) continue
        const text = typeof v.text === 'string' ? v.text.trim() : ''
        if (!text || text.length > MAX_CHAT_LEN) continue
        const seq = (viewValue(await view.get('meta/chatSeq')) || 0) + 1
        await view.put('meta/chatSeq', seq)
        await view.put('chat/' + v.matchId + '/' + padSeq(seq), {
          matchId: v.matchId,
          kind: 'message',
          author: from,
          authorName: v.name,
          text,
          createdAt: v.createdAt,
          seq
        })
      } else if (v.type === 'reveal') {
        const match = viewValue(await view.get('match/' + v.matchId))
        const pred = viewValue(await view.get('pred/' + v.matchId + '/' + from))
        if (!match || match.status !== 'locked' || !pred || pred.author !== from) continue
        const ok = verify(v.score, v.nonce, pred.hash)
        await view.put('pred/' + v.matchId + '/' + from, {
          ...pred,
          status: ok ? 'revealed' : 'invalid',
          score: ok ? v.score : pred.score
        })
      }
    }
  }

  async createInit(name = '') {
    await this.base.append({ type: 'init', host: this.localWriterKey, name })
  }
  async addWriter(keyHex, name) {
    await this.base.append({ type: 'add-writer', key: keyHex, name })
  }
  async publishIdentity(writerKey, address, name, sig, createdAt = Date.now()) {
    await this.base.append({ type: 'identity', writerKey, address, name, sig, createdAt })
  }
  async addMatch(id, teamA, teamB, createdAt) {
    await this.base.append({ type: 'add-match', id, teamA, teamB, createdAt })
  }
  async commit(matchId, hash, name, createdAt = Date.now()) {
    await this.base.append({ type: 'commit', matchId, hash, name, createdAt })
  }
  async lockMatch(matchId, createdAt = Date.now()) {
    await this.base.append({ type: 'lock', matchId, createdAt })
  }
  async updateScore(matchId, a, b, createdAt = Date.now()) {
    await this.base.append({ type: 'update-score', matchId, a, b, createdAt })
  }
  async finishMatch(matchId, createdAt = Date.now()) {
    await this.base.append({ type: 'finish-match', matchId, createdAt })
  }
  async chat(matchId, text, name, createdAt = Date.now()) {
    await this.base.append({ type: 'chat', matchId, text, name, createdAt })
  }
  async reveal(matchId, score, nonce) {
    await this.base.append({ type: 'reveal', matchId, score, nonce })
  }

  onUpdate(cb) {
    this._onUpdate = cb
  }
  replicate(stream) {
    return this.base.replicate(stream)
  }
  async update() {
    await this.base.update()
  }

  async snapshot() {
    const host = viewValue(await this.base.view.get('meta/host'))
    const tournamentName = viewValue(await this.base.view.get('meta/name')) || ''
    const matches = []
    for await (const { value } of this.base.view.createReadStream({
      gte: 'match/',
      lt: 'match0'
    })) {
      matches.push(value)
    }
    matches.sort((a, b) => a.createdAt - b.createdAt)
    const predictions = {}
    for await (const { value } of this.base.view.createReadStream({ gte: 'pred/', lt: 'pred0' })) {
      if (!predictions[value.matchId]) predictions[value.matchId] = []
      predictions[value.matchId].push({
        author: value.author,
        authorName: value.authorName,
        status: value.status,
        score: value.score,
        committedAt: value.committedAt
      })
    }
    const messages = {}
    for await (const { value } of this.base.view.createReadStream({ gte: 'chat/', lt: 'chat0' })) {
      if (!messages[value.matchId]) messages[value.matchId] = []
      messages[value.matchId].push({
        author: value.author,
        authorName: value.authorName,
        kind: value.kind,
        text: value.text,
        createdAt: value.createdAt,
        seq: value.seq
      })
    }
    const participants = {}
    for await (const { key, value } of this.base.view.createReadStream({
      gte: 'writer/',
      lt: 'writer0'
    })) {
      const writerKey = key.slice('writer/'.length)
      participants[writerKey] = {
        address: value.address || null,
        name: value.name || '',
        sig: value.sig || null
      }
    }
    return {
      matches,
      predictions,
      messages,
      participants,
      tournamentName,
      host,
      isHost: this.isHost,
      writable: this.writable,
      localAuthor: this.localWriterKey
    }
  }

  async close() {
    await this.base.close()
    await this.store.close()
  }
}

async function createLog(storeDir, name = '') {
  const log = new PredictionLog({ storeDir })
  await log.ready()
  await log.createInit(name)
  return log
}

async function openLog(storeDir, keyHex) {
  const log = new PredictionLog({ storeDir, bootstrap: b4a.from(keyHex, 'hex') })
  await log.ready()
  return log
}

module.exports = { PredictionLog, createLog, openLog }
