const test = require('brittle')
const os = require('os')
const fs = require('fs')
const path = require('path')
const { predictionsToReveal, saveSecrets, loadSecrets } = require('../workers/lib/session.js')

function tmp () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubet-session-'))
}

const preds = [
  { id: 'a', status: 'committed' },
  { id: 'b', status: 'committed' },
  { id: 'c', status: 'revealed' },
  { id: 'd', status: 'invalid' }
]

test('returns committed ids that we hold a secret for', (t) => {
  t.alike(predictionsToReveal(['a', 'b', 'x'], preds), ['a', 'b'])
})

test('excludes already revealed/invalid and unknown secrets', (t) => {
  t.alike(predictionsToReveal(['c', 'd'], preds), [])
  t.alike(predictionsToReveal([], preds), [])
})

test('saveSecrets writes all entries to disk as JSON', async (t) => {
  const secretsPath = path.join(tmp(), 'secrets.json')
  const secrets = new Map([['id1', { pick: '2-1', nonce: 'abc' }]])
  await saveSecrets(secretsPath, secrets)
  const data = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'))
  t.alike(data, { id1: { pick: '2-1', nonce: 'abc' } })
})

test('loadSecrets restores all entries from disk', async (t) => {
  const secretsPath = path.join(tmp(), 'secrets.json')
  fs.writeFileSync(secretsPath, JSON.stringify({ id2: { pick: '0-0', nonce: 'xyz' } }))
  const secrets = new Map()
  await loadSecrets(secretsPath, secrets)
  t.is(secrets.size, 1)
  t.alike(secrets.get('id2'), { pick: '0-0', nonce: 'xyz' })
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
