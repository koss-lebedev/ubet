const test = require('brittle')
const { createWalletRpc } = require('../workers/lib/wallet-rpc.js')

test('sign request resolves with the matching reply payload', async (t) => {
  let handler = null
  const sent = []
  const rpc = createWalletRpc({ send: (m) => sent.push(m), onReply: (h) => (handler = h) })
  const p = rpc.sign({ writerKey: 'w', address: '0xabc', name: 'K' })
  const req = sent[0]
  t.is(req.cmd, 'wallet-sign')
  t.alike(req.payload, { writerKey: 'w', address: '0xabc', name: 'K' })
  handler({ evt: 'wallet-result', id: req.id, ok: true, result: { typedData: {}, sig: '0xsig' } })
  const out = await p
  t.is(out.sig, '0xsig')
})

test('verify request resolves with the boolean result', async (t) => {
  let handler = null
  const sent = []
  const rpc = createWalletRpc({ send: (m) => sent.push(m), onReply: (h) => (handler = h) })
  const p = rpc.verify({ writerKey: 'w', address: '0xabc', name: 'K' }, '0xsig')
  const req = sent[0]
  t.is(req.cmd, 'wallet-verify')
  t.is(req.sig, '0xsig')
  handler({ evt: 'wallet-result', id: req.id, ok: true, result: true })
  t.is(await p, true)
})

test('an error reply rejects the promise', async (t) => {
  let handler = null
  const sent = []
  const rpc = createWalletRpc({ send: (m) => sent.push(m), onReply: (h) => (handler = h) })
  const p = rpc.sign({ writerKey: 'w', address: '0x', name: '' })
  handler({ evt: 'wallet-result', id: sent[0].id, ok: false, error: 'boom' })
  await t.exception(() => p)
})

test('getIdentity resolves with the address/name result', async (t) => {
  let handler = null
  const sent = []
  const rpc = createWalletRpc({ send: (m) => sent.push(m), onReply: (h) => (handler = h) })
  const p = rpc.getIdentity()
  t.is(sent[0].cmd, 'wallet-identity')
  handler({ evt: 'wallet-result', id: sent[0].id, ok: true, result: { address: '0xA', name: 'K' } })
  t.alike(await p, { address: '0xA', name: 'K' })
})

test('unrelated replies are ignored', async (t) => {
  let handler = null
  const sent = []
  const rpc = createWalletRpc({ send: (m) => sent.push(m), onReply: (h) => (handler = h) })
  const p = rpc.verify({ writerKey: 'w', address: '0x', name: '' }, '0xs')
  handler({ evt: 'something-else', id: sent[0].id })
  handler({ evt: 'wallet-result', id: 99999, ok: true, result: false })
  handler({ evt: 'wallet-result', id: sent[0].id, ok: true, result: true })
  t.is(await p, true)
})
