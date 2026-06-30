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

async function admit (host, joiner) {
  await pump(host, joiner, 6)
  await host.addWriter(joiner.localWriterKey, 'Lena')
  for (let i = 0; i < 14 && !joiner.writable; i++) await pump(host, joiner, 1)
}

const BR = { code: 'BR', flag: '🇧🇷', name: 'Brazil' }
const AR = { code: 'AR', flag: '🇦🇷', name: 'Argentina' }

test('host can add a match; it is open', async (t) => {
  const { host, destroy } = await pair()
  await host.addMatch('m1', BR, AR, 1000)
  await host.update()
  const snap = await host.snapshot()
  t.is(snap.matches.length, 1)
  t.is(snap.matches[0].id, 'm1')
  t.is(snap.matches[0].status, 'open')
  t.alike(snap.matches[0].teamA, BR)
  await destroy()
})

test('non-host add-match is ignored', async (t) => {
  const { host, joiner, destroy } = await pair()
  await admit(host, joiner)
  await joiner.addMatch('rogue', BR, AR, 1000)
  await pump(host, joiner)
  t.is((await host.snapshot()).matches.length, 0)
  await destroy()
})

test('matches are sorted by createdAt', async (t) => {
  const { host, destroy } = await pair()
  await host.addMatch('m2', BR, AR, 2000)
  await host.addMatch('m1', AR, BR, 1000)
  await host.update()
  const ids = (await host.snapshot()).matches.map((m) => m.id)
  t.alike(ids, ['m1', 'm2'])
  await destroy()
})

test('commit -> lock -> reveal verifies, keyed per match+author', async (t) => {
  const { host, joiner, destroy } = await pair()
  await admit(host, joiner)
  await host.addMatch('m1', BR, AR, 1000)
  await pump(host, joiner)

  const nonce = randomNonce()
  await joiner.commit('m1', commitHash('2-1', nonce), 'Lena')
  await pump(host, joiner)
  await host.lockMatch('m1')
  await pump(host, joiner)
  await joiner.reveal('m1', '2-1', nonce)
  await pump(host, joiner)

  const snap = await host.snapshot()
  t.is(snap.matches[0].status, 'locked')
  const p = snap.predictions.m1.find((x) => x.author === joiner.localWriterKey)
  t.is(p.status, 'revealed')
  t.is(p.score, '2-1')
  await destroy()
})

test('re-commit before lock overwrites the prediction', async (t) => {
  const { host, joiner, destroy } = await pair()
  await admit(host, joiner)
  await host.addMatch('m1', BR, AR, 1000)
  await pump(host, joiner)

  const n1 = randomNonce()
  const n2 = randomNonce()
  await joiner.commit('m1', commitHash('1-0', n1), 'Lena')
  await pump(host, joiner)
  await joiner.commit('m1', commitHash('3-3', n2), 'Lena')
  await pump(host, joiner)
  await host.lockMatch('m1')
  await pump(host, joiner)
  await joiner.reveal('m1', '3-3', n2)
  await pump(host, joiner)

  const snap = await host.snapshot()
  t.is(snap.predictions.m1.length, 1, 'still one prediction for the author')
  t.is(snap.predictions.m1[0].score, '3-3')
  await destroy()
})

test('tampered reveal is marked invalid', async (t) => {
  const { host, joiner, destroy } = await pair()
  await admit(host, joiner)
  await host.addMatch('m1', BR, AR, 1000)
  await pump(host, joiner)

  const nonce = randomNonce()
  await joiner.commit('m1', commitHash('2-1', nonce), 'Lena')
  await pump(host, joiner)
  await host.lockMatch('m1')
  await pump(host, joiner)
  await joiner.reveal('m1', '9-9', nonce)
  await pump(host, joiner)

  const p = (await host.snapshot()).predictions.m1[0]
  t.is(p.status, 'invalid')
  await destroy()
})

test('commit on a locked match is ignored', async (t) => {
  const { host, joiner, destroy } = await pair()
  await admit(host, joiner)
  await host.addMatch('m1', BR, AR, 1000)
  await pump(host, joiner)
  await host.lockMatch('m1')
  await pump(host, joiner)
  await joiner.commit('m1', commitHash('1-0', randomNonce()), 'Lena')
  await pump(host, joiner)

  const snap = await host.snapshot()
  t.absent(snap.predictions.m1, 'no prediction recorded after lock')
  await destroy()
})

test('locking one match leaves others open', async (t) => {
  const { host, destroy } = await pair()
  await host.addMatch('m1', BR, AR, 1000)
  await host.addMatch('m2', AR, BR, 2000)
  await host.update()
  await host.lockMatch('m1')
  await host.update()
  const byId = Object.fromEntries((await host.snapshot()).matches.map((m) => [m.id, m.status]))
  t.is(byId.m1, 'locked')
  t.is(byId.m2, 'open')
  await destroy()
})

test('non-host lock is ignored', async (t) => {
  const { host, joiner, destroy } = await pair()
  await admit(host, joiner)
  await host.addMatch('m1', BR, AR, 1000)
  await pump(host, joiner)
  await joiner.lockMatch('m1')
  await pump(host, joiner)
  t.is((await host.snapshot()).matches[0].status, 'open')
  await destroy()
})
