const test = require('brittle')
const { createWallet, walletFromSeed, verifyIdentity, isValidMnemonic } = require('../electron/wallet.js')

test('same seed derives the same address', async (t) => {
  const { seed, address } = await createWallet()
  const w = await walletFromSeed(seed)
  t.is(w.address, address)
})

test('signIdentity produces a signature that verifies against the address', async (t) => {
  const { seed, address } = await createWallet()
  const w = await walletFromSeed(seed)
  const { sig } = await w.signIdentity({ writerKey: 'deadbeef', name: 'Kostya' })
  t.ok(await verifyIdentity({ writerKey: 'deadbeef', address, name: 'Kostya' }, sig))
})

test('tampered name fails verification', async (t) => {
  const { seed, address } = await createWallet()
  const w = await walletFromSeed(seed)
  const { sig } = await w.signIdentity({ writerKey: 'deadbeef', name: 'Kostya' })
  t.absent(await verifyIdentity({ writerKey: 'deadbeef', address, name: 'Mallory' }, sig))
})

test('wrong writerKey fails verification', async (t) => {
  const { seed, address } = await createWallet()
  const w = await walletFromSeed(seed)
  const { sig } = await w.signIdentity({ writerKey: 'deadbeef', name: 'Kostya' })
  t.absent(await verifyIdentity({ writerKey: 'cafe', address, name: 'Kostya' }, sig))
})

test('isValidMnemonic accepts a generated seed and rejects garbage', async (t) => {
  const { seed } = await createWallet()
  t.ok(await isValidMnemonic(seed))
  t.absent(await isValidMnemonic('not a real seed phrase at all'))
})
