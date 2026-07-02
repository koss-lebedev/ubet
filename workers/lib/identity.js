'use strict'

const b4a = require('b4a')

function fingerprint(publicKey) {
  if (!publicKey || publicKey.length < 4) {
    throw new Error('publicKey must be at least 4 bytes')
  }
  return b4a.toString(publicKey.subarray(0, 4), 'hex')
}

module.exports = { fingerprint }
