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

      if (v.type === 'init') {
        await view.put('meta/host', v.host)
        if (viewValue(await view.get('meta/phase')) === null) await view.put('meta/phase', 'open')
      } else if (v.type === 'add-writer') {
        await host.addWriter(b4a.from(v.key, 'hex'), { indexer: true })
        await view.put('writer/' + v.key, { name: v.name })
      } else if (v.type === 'commit') {
        if (viewValue(await view.get('meta/phase')) !== 'open') continue
        await view.put('pred/' + v.id, { id: v.id, author: from, authorName: v.name, hash: v.hash, status: 'committed' })
      } else if (v.type === 'lock') {
        if (from === viewValue(await view.get('meta/host'))) await view.put('meta/phase', 'locked')
      } else if (v.type === 'reveal') {
        const phase = viewValue(await view.get('meta/phase'))
        const pred = viewValue(await view.get('pred/' + v.id))
        if (!pred) continue
        const ok = phase === 'locked' && pred.author === from && verify(v.pick, v.nonce, pred.hash)
        await view.put('pred/' + v.id, { ...pred, status: ok ? 'revealed' : 'invalid', pick: ok ? v.pick : pred.pick })
      }
    }
  }

  async createInit () { await this.base.append({ type: 'init', host: this.localWriterKey }) }
  async addWriter (keyHex, name) { await this.base.append({ type: 'add-writer', key: keyHex, name }) }
  async commit (id, hash, name) { await this.base.append({ type: 'commit', id, hash, name }) }
  async lock () { await this.base.append({ type: 'lock' }) }
  async reveal (id, pick, nonce) { await this.base.append({ type: 'reveal', id, pick, nonce }) }

  onUpdate (cb) { this._onUpdate = cb }
  replicate (stream) { return this.base.replicate(stream) }
  async update () { await this.base.update() }

  async snapshot () {
    const phase = viewValue(await this.base.view.get('meta/phase')) || 'open'
    const host = viewValue(await this.base.view.get('meta/host'))
    const predictions = []
    for await (const { value } of this.base.view.createReadStream({ gte: 'pred/', lt: 'pred0' })) {
      predictions.push(value)
    }
    return { phase, host, isHost: this.isHost, writable: this.writable, predictions }
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
