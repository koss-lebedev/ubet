const test = require('brittle')
const os = require('os')
const fs = require('fs')
const path = require('path')
const { writeManifest, listManifests } = require('../workers/lib/tournament-manifest.js')

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubet-manifest-'))
}

test('writeManifest creates tournament.json with key, name, and createdAt', async (t) => {
  const dir = tmp()
  await writeManifest(dir, { key: 'a'.repeat(64), name: 'Alice' })
  const data = JSON.parse(fs.readFileSync(path.join(dir, 'tournament.json'), 'utf-8'))
  t.is(data.key, 'a'.repeat(64))
  t.is(data.name, 'Alice')
  t.ok(typeof data.createdAt === 'number' && data.createdAt > 0)
})

test('writeManifest does not overwrite an existing tournament.json', async (t) => {
  const dir = tmp()
  const original = { key: 'a'.repeat(64), name: 'Alice', createdAt: 999 }
  fs.writeFileSync(path.join(dir, 'tournament.json'), JSON.stringify(original))
  await writeManifest(dir, { key: 'b'.repeat(64), name: 'Bob' })
  const data = JSON.parse(fs.readFileSync(path.join(dir, 'tournament.json'), 'utf-8'))
  t.is(data.name, 'Alice')
  t.is(data.createdAt, 999)
})

test('listManifests returns entries sorted newest-first', async (t) => {
  const root = tmp()
  const r1 = path.join(root, 'tournament1')
  const r2 = path.join(root, 'tournament2')
  fs.mkdirSync(r1)
  fs.mkdirSync(r2)
  fs.writeFileSync(
    path.join(r1, 'tournament.json'),
    JSON.stringify({ key: 'a'.repeat(64), name: 'Alice', createdAt: 1000 })
  )
  fs.writeFileSync(
    path.join(r2, 'tournament.json'),
    JSON.stringify({ key: 'b'.repeat(64), name: 'Bob', createdAt: 2000 })
  )
  const results = await listManifests(root)
  t.is(results.length, 2)
  t.is(results[0].createdAt, 2000)
  t.is(results[0].name, 'Bob')
  t.is(results[1].createdAt, 1000)
})

test('listManifests skips malformed entries', async (t) => {
  const root = tmp()
  const r1 = path.join(root, 'bad')
  fs.mkdirSync(r1)
  fs.writeFileSync(path.join(r1, 'tournament.json'), 'not json')
  const results = await listManifests(root)
  t.is(results.length, 0)
})

test('listManifests returns empty array when tournamentsDir does not exist', async (t) => {
  const results = await listManifests('/nonexistent/path/tournaments')
  t.alike(results, [])
})

test('listManifests includes storeDir in each entry', async (t) => {
  const root = tmp()
  const r1 = path.join(root, 'tournament1')
  fs.mkdirSync(r1)
  fs.writeFileSync(
    path.join(r1, 'tournament.json'),
    JSON.stringify({ key: 'a'.repeat(64), name: 'Alice', createdAt: 1000 })
  )
  const results = await listManifests(root)
  t.is(results[0].storeDir, r1)
})
