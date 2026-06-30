const test = require('brittle')
const os = require('os')
const fs = require('fs')
const path = require('path')
const { matchesToReveal, saveSecrets, loadSecrets } = require('../workers/lib/session.js')

function tmp () {
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
