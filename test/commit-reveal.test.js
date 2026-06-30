const test = require('brittle')
const { randomNonce, commitHash, verify } = require('../workers/lib/commit-reveal.js')

test('randomNonce is 64 hex chars and unique', (t) => {
  const a = randomNonce()
  const b = randomNonce()
  t.is(a.length, 64)
  t.ok(/^[0-9a-f]{64}$/.test(a))
  t.not(a, b)
})

test('commitHash is deterministic for same inputs', (t) => {
  t.is(commitHash('2-1', 'abc'), commitHash('2-1', 'abc'))
})

test('commitHash changes with nonce or pick', (t) => {
  t.not(commitHash('2-1', 'abc'), commitHash('2-1', 'abd'))
  t.not(commitHash('2-1', 'abc'), commitHash('3-1', 'abc'))
})

test('verify accepts matching and rejects tampered', (t) => {
  const nonce = randomNonce()
  const hash = commitHash('2-1', nonce)
  t.ok(verify('2-1', nonce, hash))
  t.absent(verify('3-1', nonce, hash))
  t.absent(verify('2-1', randomNonce(), hash))
})
