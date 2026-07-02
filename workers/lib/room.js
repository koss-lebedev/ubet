'use strict'

const b4a = require('b4a')

const HEX64 = /^[0-9a-fA-F]{64}$/

class Room {
  constructor({ swarm, onConnection = () => {}, onStatus = () => {} }) {
    if (!swarm) throw new Error('swarm is required')
    this.swarm = swarm
    this.onConnection = onConnection
    this.onStatus = onStatus
    this.topic = null
    this._handler = (conn) => this.onConnection(conn)
  }

  async join(topicHex) {
    if (!HEX64.test(topicHex)) throw new Error('Room key must be 64 hex characters')
    this.topic = b4a.from(topicHex, 'hex')
    this.swarm.on('connection', this._handler)
    this.onStatus('connecting')
    const discovery = this.swarm.join(this.topic, { server: true, client: true })
    if (discovery && discovery.flushed) await discovery.flushed()
    this.onStatus('connected')
  }

  async leave() {
    if (this.topic) {
      if (this.swarm.removeListener) this.swarm.removeListener('connection', this._handler)
      await this.swarm.leave(this.topic)
    }
    this.topic = null
  }
}

module.exports = { Room }
