'use strict'

// Worker-side client for wallet operations that live in Electron main.
// The worker never imports WDK; it sends signing/verification requests over
// the FramedStream pipe and correlates replies by a monotonic id.
//
// Request:  { cmd: 'wallet-sign'|'wallet-verify', id, payload, sig? }
// Reply:    { evt: 'wallet-result', id, ok, result, error }

function createWalletRpc({ send, onReply }) {
  const pending = new Map()
  let nextId = 1

  onReply((msg) => {
    if (!msg || msg.evt !== 'wallet-result') return
    const entry = pending.get(msg.id)
    if (!entry) return
    pending.delete(msg.id)
    if (msg.ok) entry.resolve(msg.result)
    else entry.reject(new Error(msg.error || 'wallet rpc failed'))
  })

  function request(extra) {
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      send({ id, ...extra })
    })
  }

  return {
    sign(payload) {
      return request({ cmd: 'wallet-sign', payload })
    },
    verify(payload, sig) {
      return request({ cmd: 'wallet-verify', payload, sig })
    }
  }
}

module.exports = { createWalletRpc }
