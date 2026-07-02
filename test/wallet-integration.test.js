// Integration test of the worker<->main wallet contract WITHOUT Electron:
// the worker's walletRpc client is wired to a fake "main" that answers using
// the real electron/wallet.js (the same code Electron main runs). This
// exercises the full sign -> publish payload -> verify cycle end to end.
const test = require('brittle')
const { createWalletRpc } = require('../workers/lib/wallet-rpc.js')
const wallet = require('../electron/wallet.js')

// Build a walletRpc whose requests are answered by the real wallet module,
// standing in for Electron main + its identity store.
async function wireRpc() {
  const created = await wallet.createWallet()
  const w = await wallet.walletFromSeed(created.seed)
  const profile = { address: created.address, name: 'Kostya' }
  let onReplyHandler = null
  const rpc = createWalletRpc({
    send: (msg) => {
      // Simulate main receiving the request and replying asynchronously.
      Promise.resolve().then(async () => {
        let result
        try {
          if (msg.cmd === 'wallet-identity') result = { address: profile.address, name: profile.name }
          else if (msg.cmd === 'wallet-sign') {
            const { sig } = await w.signIdentity({ writerKey: msg.payload.writerKey, name: msg.payload.name })
            result = { sig }
          } else if (msg.cmd === 'wallet-verify') {
            result = await wallet.verifyIdentity(msg.payload, msg.sig)
          }
          onReplyHandler({ evt: 'wallet-result', id: msg.id, ok: true, result })
        } catch (err) {
          onReplyHandler({ evt: 'wallet-result', id: msg.id, ok: false, error: err.message })
        }
      })
    },
    onReply: (h) => (onReplyHandler = h)
  })
  return { rpc, profile }
}

test('worker can fetch identity, sign a binding, and verify it via the RPC', async (t) => {
  const { rpc, profile } = await wireRpc()
  const id = await rpc.getIdentity()
  t.is(id.address, profile.address)
  t.is(id.name, 'Kostya')

  const writerKey = 'deadbeefdeadbeef'
  const { sig } = await rpc.sign({ writerKey, address: id.address, name: id.name })
  t.ok(await rpc.verify({ writerKey, address: id.address, name: id.name }, sig))
})

test('a binding signed for one writerKey does not verify for another (replay-forgery guard)', async (t) => {
  const { rpc } = await wireRpc()
  const id = await rpc.getIdentity()
  const { sig } = await rpc.sign({ writerKey: 'writer-A', address: id.address, name: id.name })
  // Same address/name/sig but a different writerKey must fail — this is what the
  // reducer's author-match guard relies on to block replaying someone's binding.
  t.absent(await rpc.verify({ writerKey: 'writer-B', address: id.address, name: id.name }, sig))
})

test('a binding does not verify against a different address', async (t) => {
  const a = await wireRpc()
  const b = await wireRpc()
  const idA = await a.rpc.getIdentity()
  const idB = await b.rpc.getIdentity()
  const { sig } = await a.rpc.sign({ writerKey: 'w', address: idA.address, name: idA.name })
  t.absent(await a.rpc.verify({ writerKey: 'w', address: idB.address, name: idA.name }, sig))
})
