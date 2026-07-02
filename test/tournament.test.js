const test = require('brittle')
const { Tournament } = require('../workers/lib/tournament.js')

function makeFakeSwarm() {
  const handlers = {}
  return {
    joined: [],
    left: [],
    on(evt, cb) {
      ;(handlers[evt] = handlers[evt] || []).push(cb)
    },
    removeListener(evt, cb) {
      handlers[evt] = (handlers[evt] || []).filter((h) => h !== cb)
    },
    join(topic, opts) {
      this.joined.push({ topic, opts })
      return { flushed: () => Promise.resolve() }
    },
    leave(topic) {
      this.left.push(topic)
    },
    emitConnection(conn) {
      for (const h of handlers.connection || []) h(conn)
    }
  }
}

test('join validates the key, joins server+client, and reports status', async (t) => {
  const swarm = makeFakeSwarm()
  const statuses = []
  const tournament = new Tournament({ swarm, onStatus: (s) => statuses.push(s) })
  await tournament.join('ab'.repeat(32))
  t.is(swarm.joined.length, 1)
  t.alike(swarm.joined[0].opts, { server: true, client: true })
  t.alike(statuses, ['connecting', 'connected'])
})

test('join rejects an invalid key', async (t) => {
  const tournament = new Tournament({ swarm: makeFakeSwarm() })
  await t.exception(() => tournament.join('not-hex'))
})

test('each connection invokes onConnection', async (t) => {
  const swarm = makeFakeSwarm()
  const conns = []
  const tournament = new Tournament({ swarm, onConnection: (c) => conns.push(c) })
  await tournament.join('cd'.repeat(32))
  swarm.emitConnection({ id: 1 })
  swarm.emitConnection({ id: 2 })
  t.is(conns.length, 2)
  t.is(conns[1].id, 2)
})

test('leave stops listening and leaves the topic', async (t) => {
  const swarm = makeFakeSwarm()
  const tournament = new Tournament({ swarm })
  await tournament.join('ef'.repeat(32))
  await tournament.leave()
  t.is(swarm.left.length, 1)
})
