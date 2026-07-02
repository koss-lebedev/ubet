const test = require('brittle')
const { Room } = require('../workers/lib/room.js')

function makeFakeSwarm () {
  const handlers = {}
  return {
    joined: [],
    left: [],
    on (evt, cb) { (handlers[evt] = handlers[evt] || []).push(cb) },
    removeListener (evt, cb) { handlers[evt] = (handlers[evt] || []).filter((h) => h !== cb) },
    join (topic, opts) { this.joined.push({ topic, opts }); return { flushed: () => Promise.resolve() } },
    leave (topic) { this.left.push(topic) },
    emitConnection (conn) { for (const h of (handlers.connection || [])) h(conn) }
  }
}

test('join validates the key, joins server+client, and reports status', async (t) => {
  const swarm = makeFakeSwarm()
  const statuses = []
  const room = new Room({ swarm, onStatus: (s) => statuses.push(s) })
  await room.join('ab'.repeat(32))
  t.is(swarm.joined.length, 1)
  t.alike(swarm.joined[0].opts, { server: true, client: true })
  t.alike(statuses, ['connecting', 'connected'])
})

test('join rejects an invalid key', async (t) => {
  const room = new Room({ swarm: makeFakeSwarm() })
  await t.exception(() => room.join('not-hex'))
})

test('each connection invokes onConnection', async (t) => {
  const swarm = makeFakeSwarm()
  const conns = []
  const room = new Room({ swarm, onConnection: (c) => conns.push(c) })
  await room.join('cd'.repeat(32))
  swarm.emitConnection({ id: 1 })
  swarm.emitConnection({ id: 2 })
  t.is(conns.length, 2)
  t.is(conns[1].id, 2)
})

test('leave stops listening and leaves the topic', async (t) => {
  const swarm = makeFakeSwarm()
  const room = new Room({ swarm })
  await room.join('ef'.repeat(32))
  await room.leave()
  t.is(swarm.left.length, 1)
})
