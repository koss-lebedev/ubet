const test = require('brittle')
const os = require('os')
const fs = require('fs')
const path = require('path')
const {
  matchesToReveal,
  saveSecrets,
  loadSecrets,
  resolveParticipants
} = require('../workers/lib/session.js')

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubet-session-'))
}

const matches = [
  { id: 'm1', status: 'locked' },
  { id: 'm2', status: 'open' },
  { id: 'm3', status: 'locked' }
]

test('returns locked matches we hold a secret for and have not revealed', (t) => {
  t.alike(matchesToReveal(['m1', 'm2', 'm3'], matches, new Set()), ['m1', 'm3'])
})

test('excludes already-revealed matches', (t) => {
  t.alike(matchesToReveal(['m1', 'm3'], matches, new Set(['m1'])), ['m3'])
})

test('excludes open matches and unknown secrets', (t) => {
  t.alike(matchesToReveal(['m2', 'unknown'], matches, new Set()), [])
  t.alike(matchesToReveal([], matches, new Set()), [])
})

test('saveSecrets writes all entries to disk as JSON', async (t) => {
  const secretsPath = path.join(tmp(), 'secrets.json')
  const secrets = new Map([['m1', { a: 2, b: 1, nonce: 'abc' }]])
  await saveSecrets(secretsPath, secrets)
  const data = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'))
  t.alike(data, { m1: { a: 2, b: 1, nonce: 'abc' } })
})

test('loadSecrets restores all entries from disk', async (t) => {
  const secretsPath = path.join(tmp(), 'secrets.json')
  fs.writeFileSync(secretsPath, JSON.stringify({ m2: { a: 0, b: 0, nonce: 'xyz' } }))
  const secrets = new Map()
  await loadSecrets(secretsPath, secrets)
  t.is(secrets.size, 1)
  t.alike(secrets.get('m2'), { a: 0, b: 0, nonce: 'xyz' })
})

test('loadSecrets is a no-op when file is absent', async (t) => {
  const secrets = new Map()
  await loadSecrets('/nonexistent/path/secrets.json', secrets)
  t.is(secrets.size, 0)
})

test('loadSecrets is a no-op when file is corrupt', async (t) => {
  const secretsPath = path.join(tmp(), 'secrets.json')
  fs.writeFileSync(secretsPath, 'not valid json')
  const secrets = new Map()
  await loadSecrets(secretsPath, secrets)
  t.is(secrets.size, 0)
})

test('resolveParticipants marks verified by signature, drops sig, and caches', async (t) => {
  let calls = 0
  const walletRpc = {
    async verify(_payload, sig) {
      calls++
      return sig === '0xSIG'
    }
  }
  const raw = {
    w1: { address: '0xA', name: 'K', sig: '0xSIG' },
    w2: { address: '0xB', name: 'L', sig: '0xBAD' },
    w3: { address: null, name: 'X', sig: null }
  }
  const cache = new Map()
  const out = await resolveParticipants(raw, walletRpc, cache)
  t.is(out.w1.verified, true)
  t.is(out.w2.verified, false)
  t.is(out.w3.verified, false)
  t.absent(out.w1.sig) // sig must not leak into participants sent to the UI
  t.is(calls, 2) // w1 + w2 verified; w3 skipped (no sig)
  await resolveParticipants(raw, walletRpc, cache) // second pass hits cache
  t.is(calls, 2)
})

test('resolveParticipants re-verifies when a writer signature changes', async (t) => {
  let calls = 0
  const walletRpc = {
    async verify() {
      calls++
      return true
    }
  }
  const cache = new Map()
  await resolveParticipants({ w1: { address: '0xA', name: 'K', sig: '0xS1' } }, walletRpc, cache)
  await resolveParticipants({ w1: { address: '0xA', name: 'K', sig: '0xS2' } }, walletRpc, cache)
  t.is(calls, 2)
})
