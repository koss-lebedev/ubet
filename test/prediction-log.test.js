const test = require('brittle')
const os = require('os')
const fs = require('fs')
const path = require('path')
const { createLog, openLog } = require('../workers/lib/prediction-log.js')
const { commitHash, randomNonce } = require('../workers/lib/commit-reveal.js')

function tmp () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubet-plog-'))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function pump (a, b, n = 16) {
  for (let i = 0; i < n; i++) {
    await a.update()
    await b.update()
    try { if (a.writable) await a.base.ack() } catch {}
    await sleep(120)
  }
}

async function pair () {
  const host = await createLog(tmp())
  const joiner = await openLog(tmp(), host.key)
  const s1 = host.replicate(true)
  const s2 = joiner.replicate(false)
  s1.pipe(s2).pipe(s1)
  return { host, joiner, destroy: async () => { s1.destroy(); s2.destroy(); await host.close(); await joiner.close() } }
}

test('commit -> lock -> reveal verifies on the host view', async (t) => {
  const { host, joiner, destroy } = await pair()
  await pump(host, joiner, 6)
  await host.addWriter(joiner.localWriterKey, 'Lena')
  for (let i = 0; i < 14 && !joiner.writable; i++) await pump(host, joiner, 1)
  t.ok(joiner.writable, 'joiner admitted as writer')

  const nonce = randomNonce()
  await joiner.commit('p1', commitHash('2-1', nonce), 'Lena')
  await pump(host, joiner)
  await host.lock()
  await pump(host, joiner)
  await joiner.reveal('p1', '2-1', nonce)
  await pump(host, joiner)

  const snap = await host.snapshot()
  const p = snap.predictions.find((x) => x.id === 'p1')
  t.is(snap.phase, 'locked')
  t.is(p.status, 'revealed')
  t.is(p.pick, '2-1')
  await destroy()
})

test('tampered reveal is marked invalid', async (t) => {
  const { host, joiner, destroy } = await pair()
  await pump(host, joiner, 6)
  await host.addWriter(joiner.localWriterKey, 'Lena')
  for (let i = 0; i < 14 && !joiner.writable; i++) await pump(host, joiner, 1)

  const nonce = randomNonce()
  await joiner.commit('p2', commitHash('2-1', nonce), 'Lena')
  await pump(host, joiner)
  await host.lock()
  await pump(host, joiner)
  await joiner.reveal('p2', '9-9', nonce) // wrong pick
  await pump(host, joiner)

  const p = (await host.snapshot()).predictions.find((x) => x.id === 'p2')
  t.is(p.status, 'invalid')
  await destroy()
})

test('commit after lock is ignored', async (t) => {
  const { host, joiner, destroy } = await pair()
  await pump(host, joiner, 6)
  await host.addWriter(joiner.localWriterKey, 'Lena')
  for (let i = 0; i < 14 && !joiner.writable; i++) await pump(host, joiner, 1)

  await host.lock()
  await pump(host, joiner)
  await joiner.commit('late', commitHash('1-0', randomNonce()), 'Lena')
  await pump(host, joiner)

  const p = (await host.snapshot()).predictions.find((x) => x.id === 'late')
  t.absent(p, 'commit after lock not recorded')
  await destroy()
})
