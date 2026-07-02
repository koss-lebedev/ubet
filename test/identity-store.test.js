const test = require('brittle')
const os = require('os')
const fs = require('fs')
const path = require('path')
const { openIdentityStore } = require('../electron/identity-store.js')

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubet-id-'))
}
// Fake crypter: reversible, no OS keychain needed in tests.
const crypter = {
  async encrypt(s) {
    return Buffer.from(s, 'utf-8')
  },
  async decrypt(b) {
    return Buffer.from(b).toString('utf-8')
  }
}

test('a fresh store has no identities and no active selection', async (t) => {
  const s = await openIdentityStore({ dir: tmp(), crypter })
  const list = await s.load()
  t.is(list.active, null)
  t.alike(list.identities, [])
  t.is(s.active(), null)
})

test('create adds an identity, makes it active, and persists', async (t) => {
  const dir = tmp()
  const a = await openIdentityStore({ dir, crypter })
  await a.load()
  const created = await a.create()
  t.ok(created.address.startsWith('0x'))
  t.is(created.name, '')
  t.is(a.list().active, created.address)

  const b = await openIdentityStore({ dir, crypter })
  const list = await b.load()
  t.is(list.active, created.address)
  t.is(list.identities.length, 1)
  t.is(b.active().address, created.address)
})

test('setName names the active identity and persists', async (t) => {
  const dir = tmp()
  const a = await openIdentityStore({ dir, crypter })
  await a.load()
  await a.create()
  await a.setName('Kostya')
  t.is(a.active().name, 'Kostya')

  const b = await openIdentityStore({ dir, crypter })
  await b.load()
  t.is(b.active().name, 'Kostya')
})

test('multiple identities coexist; select switches the active wallet', async (t) => {
  const dir = tmp()
  const s = await openIdentityStore({ dir, crypter })
  await s.load()
  const one = await s.create()
  await s.setName('One')
  const two = await s.create()
  await s.setName('Two')
  t.is(s.list().identities.length, 2)
  t.is(s.list().active, two.address)

  await s.select(one.address)
  t.is(s.active().address, one.address)
  t.is(s.getRecoveryPhrase().split(' ').length, 24) // active wallet is loaded
})

test('restore imports a seed as an identity and activates it', async (t) => {
  const src = await openIdentityStore({ dir: tmp(), crypter })
  await src.load()
  await src.create()
  const phrase = src.getRecoveryPhrase()

  const dst = await openIdentityStore({ dir: tmp(), crypter })
  await dst.load()
  const restored = await dst.restore(phrase)
  t.is(restored.address, src.active().address)
  t.is(dst.list().active, restored.address)
  await t.exception(() => dst.restore('garbage not a mnemonic'))
})

test('selecting an unknown identity throws', async (t) => {
  const s = await openIdentityStore({ dir: tmp(), crypter })
  await s.load()
  await t.exception(() => s.select('0xdeadbeef'))
})
