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

test('first run creates a wallet and persists profile', async (t) => {
  const dir = tmp()
  const store = await openIdentityStore({ dir, crypter })
  const { address } = await store.loadOrCreate()
  t.ok(address.startsWith('0x'))
  t.ok(fs.existsSync(path.join(dir, 'wallet.enc')))
  t.is(store.getProfile().name, '')
})

test('reopening the same dir yields the same address', async (t) => {
  const dir = tmp()
  const a = await openIdentityStore({ dir, crypter })
  const r1 = await a.loadOrCreate()
  const b = await openIdentityStore({ dir, crypter })
  const r2 = await b.loadOrCreate()
  t.is(r1.address, r2.address)
})

test('setName persists across reopen', async (t) => {
  const dir = tmp()
  const a = await openIdentityStore({ dir, crypter })
  await a.loadOrCreate()
  await a.setName('Kostya')
  const b = await openIdentityStore({ dir, crypter })
  await b.loadOrCreate()
  t.is(b.getProfile().name, 'Kostya')
})

test('restore with a valid phrase reproduces the address; invalid phrase throws', async (t) => {
  const a = await openIdentityStore({ dir: tmp(), crypter })
  await a.loadOrCreate()
  const phrase = a.getRecoveryPhrase()
  const b = await openIdentityStore({ dir: tmp(), crypter })
  const restored = await b.restore(phrase)
  t.is(restored.address, a.getProfile().address)
  await t.exception(() => b.restore('garbage not a mnemonic'))
})
