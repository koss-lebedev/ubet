const test = require('brittle')
const os = require('os')
const fs = require('fs')
const path = require('path')
const { createLog, openLog } = require('../workers/lib/prediction-log.js')
const { commitHash, randomNonce } = require('../workers/lib/commit-reveal.js')

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubet-plog-'))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function pump(a, b, n = 16) {
  for (let i = 0; i < n; i++) {
    await a.update()
    await b.update()
    try {
      if (a.writable) await a.base.ack()
    } catch {}
    await sleep(120)
  }
}

async function pair() {
  const host = await createLog(tmp())
  const joiner = await openLog(tmp(), host.key)
  const s1 = host.replicate(true)
  const s2 = joiner.replicate(false)
  s1.pipe(s2).pipe(s1)
  return {
    host,
    joiner,
    destroy: async () => {
      s1.destroy()
      s2.destroy()
      await host.close()
      await joiner.close()
    }
  }
}

async function admit(host, joiner) {
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

test('chat messages replicate and land in snapshot in order', async (t) => {
  const { host, joiner, destroy } = await pair()
  await admit(host, joiner)
  await host.addMatch('m1', BR, AR, 1000)
  await pump(host, joiner)

  await host.chat('m1', 'hello', 'Ada', 1100)
  await pump(host, joiner)
  await joiner.chat('m1', 'hi there', 'Lena', 1200)
  await pump(host, joiner)

  for (const log of [host, joiner]) {
    const msgs = (await log.snapshot()).messages.m1
    t.is(msgs.length, 2)
    t.alike(
      msgs.map((m) => m.text),
      ['hello', 'hi there']
    )
    t.alike(
      msgs.map((m) => m.authorName),
      ['Ada', 'Lena']
    )
    t.alike(
      msgs.map((m) => m.kind),
      ['message', 'message']
    )
    t.ok(msgs[0].seq < msgs[1].seq, 'seq is monotonic')
  }
  await destroy()
})

test('timestamps populate for commit, lock, update-score', async (t) => {
  const { host, joiner, destroy } = await pair()
  await admit(host, joiner)
  await host.addMatch('m1', BR, AR, 1000)
  await pump(host, joiner)
  await joiner.commit('m1', commitHash('2-1', randomNonce()), 'Lena', 1500)
  await pump(host, joiner)
  await host.lockMatch('m1', 1600)
  await pump(host, joiner)
  await host.updateScore('m1', 2, 1, 1700)
  await pump(host, joiner)

  const snap = await host.snapshot()
  t.is(snap.matches[0].lockedAt, 1600)
  t.alike(snap.matches[0].result, { a: 2, b: 1 })
  t.is(snap.predictions.m1[0].committedAt, 1500)
  await destroy()
})

test('lock seeds the score at 0-0', async (t) => {
  const { host, destroy } = await pair()
  await host.addMatch('m1', BR, AR, 1000)
  await host.update()
  await host.lockMatch('m1')
  await host.update()
  t.alike((await host.snapshot()).matches[0].result, { a: 0, b: 0 })
  await destroy()
})

test('update-score can be applied more than once while locked', async (t) => {
  const { host, destroy } = await pair()
  await host.addMatch('m1', BR, AR, 1000)
  await host.update()
  await host.lockMatch('m1')
  await host.update()
  await host.updateScore('m1', 1, 0)
  await host.update()
  await host.updateScore('m1', 2, 1)
  await host.update()
  t.alike((await host.snapshot()).matches[0].result, { a: 2, b: 1 })
  await destroy()
})

test('update-score on an open match is ignored', async (t) => {
  const { host, destroy } = await pair()
  await host.addMatch('m1', BR, AR, 1000)
  await host.update()
  await host.updateScore('m1', 2, 1)
  await host.update()
  t.absent((await host.snapshot()).matches[0].result)
  await destroy()
})

test('non-host update-score is ignored', async (t) => {
  const { host, joiner, destroy } = await pair()
  await admit(host, joiner)
  await host.addMatch('m1', BR, AR, 1000)
  await pump(host, joiner)
  await host.lockMatch('m1')
  await pump(host, joiner)
  await joiner.updateScore('m1', 5, 5)
  await pump(host, joiner)
  t.alike((await host.snapshot()).matches[0].result, { a: 0, b: 0 })
  await destroy()
})

test('each update-score posts a system chat message', async (t) => {
  const { host, destroy } = await pair()
  await host.addMatch('m1', BR, AR, 1000)
  await host.update()
  await host.lockMatch('m1')
  await host.update()
  await host.updateScore('m1', 1, 0, 2000)
  await host.update()
  await host.updateScore('m1', 2, 0, 3000)
  await host.update()

  const msgs = (await host.snapshot()).messages.m1
  t.is(msgs.length, 2)
  t.alike(
    msgs.map((m) => m.kind),
    ['system', 'system']
  )
  t.alike(
    msgs.map((m) => m.text),
    ['Score updated — 1–0', 'Score updated — 2–0']
  )
  t.ok(msgs[0].seq < msgs[1].seq, 'seq is monotonic')
  await destroy()
})

test('finish-match moves status to final and posts a system chat message', async (t) => {
  const { host, destroy } = await pair()
  await host.addMatch('m1', BR, AR, 1000)
  await host.update()
  await host.lockMatch('m1')
  await host.update()
  await host.updateScore('m1', 2, 1)
  await host.update()
  await host.finishMatch('m1', 5000)
  await host.update()

  const snap = await host.snapshot()
  t.is(snap.matches[0].status, 'final')
  t.is(snap.matches[0].finishedAt, 5000)
  t.alike(snap.matches[0].result, { a: 2, b: 1 })
  const msgs = snap.messages.m1
  t.is(msgs.length, 2, 'one for the update, one for the finish')
  t.is(msgs[1].kind, 'system')
  t.is(msgs[1].text, 'Match finished — final score 2–1')
  await destroy()
})

test('finish-match with no prior update-score finishes at the seeded 0-0', async (t) => {
  const { host, destroy } = await pair()
  await host.addMatch('m1', BR, AR, 1000)
  await host.update()
  await host.lockMatch('m1')
  await host.update()
  await host.finishMatch('m1')
  await host.update()

  const snap = await host.snapshot()
  t.is(snap.matches[0].status, 'final')
  t.alike(snap.matches[0].result, { a: 0, b: 0 })
  t.is(snap.messages.m1[0].text, 'Match finished — final score 0–0')
  await destroy()
})

test('update-score after finish is ignored', async (t) => {
  const { host, destroy } = await pair()
  await host.addMatch('m1', BR, AR, 1000)
  await host.update()
  await host.lockMatch('m1')
  await host.update()
  await host.finishMatch('m1')
  await host.update()
  await host.updateScore('m1', 9, 9)
  await host.update()

  t.alike((await host.snapshot()).matches[0].result, { a: 0, b: 0 })
  await destroy()
})

test('finish-match twice is ignored the second time', async (t) => {
  const { host, destroy } = await pair()
  await host.addMatch('m1', BR, AR, 1000)
  await host.update()
  await host.lockMatch('m1')
  await host.update()
  await host.finishMatch('m1', 5000)
  await host.update()
  await host.finishMatch('m1', 9999)
  await host.update()

  const snap = await host.snapshot()
  t.is(snap.matches[0].finishedAt, 5000, 'the second finish did not overwrite the first')
  t.is(snap.messages.m1.length, 1, 'no second system message')
  await destroy()
})

test('finish-match on an open match is ignored', async (t) => {
  const { host, destroy } = await pair()
  await host.addMatch('m1', BR, AR, 1000)
  await host.update()
  await host.finishMatch('m1')
  await host.update()
  t.is((await host.snapshot()).matches[0].status, 'open')
  await destroy()
})

test('non-host finish-match is ignored', async (t) => {
  const { host, joiner, destroy } = await pair()
  await admit(host, joiner)
  await host.addMatch('m1', BR, AR, 1000)
  await pump(host, joiner)
  await host.lockMatch('m1')
  await pump(host, joiner)
  await joiner.finishMatch('m1')
  await pump(host, joiner)
  t.is((await host.snapshot()).matches[0].status, 'locked')
  await destroy()
})

test('chat for unknown match is ignored', async (t) => {
  const { host, destroy } = await pair()
  await host.chat('nope', 'ghost', 'Ada', 1100)
  await host.update()
  t.absent((await host.snapshot()).messages.nope)
  await destroy()
})

test('empty and oversized chat messages are rejected', async (t) => {
  const { host, destroy } = await pair()
  await host.addMatch('m1', BR, AR, 1000)
  await host.update()
  await host.chat('m1', '   ', 'Ada', 1100)
  await host.chat('m1', 'x'.repeat(2001), 'Ada', 1200)
  await host.update()
  t.absent((await host.snapshot()).messages.m1)
  await destroy()
})

test('chat text is trimmed', async (t) => {
  const { host, destroy } = await pair()
  await host.addMatch('m1', BR, AR, 1000)
  await host.update()
  await host.chat('m1', '  spaced  ', 'Ada', 1100)
  await host.update()
  t.is((await host.snapshot()).messages.m1[0].text, 'spaced')
  await destroy()
})

test('identity entry with matching author is stored in participants', async (t) => {
  const { host, joiner, destroy } = await pair()
  const wk = host.localWriterKey
  await host.publishIdentity(wk, '0xAddr', 'Kostya', '0xsig', Date.now())
  await pump(host, joiner)
  const snap = await joiner.snapshot()
  t.is(snap.participants[wk].address, '0xAddr')
  t.is(snap.participants[wk].name, 'Kostya')
  t.is(snap.participants[wk].sig, '0xsig')
  await destroy()
})

test('identity entry with mismatched author is dropped (replay guard)', async (t) => {
  const { host, joiner, destroy } = await pair()
  const victim = 'a'.repeat(64)
  await host.publishIdentity(victim, '0xAddr', 'Victim', '0xsig', Date.now())
  await pump(host, joiner)
  t.absent((await joiner.snapshot()).participants[victim])
  await destroy()
})
