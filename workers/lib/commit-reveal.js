'use strict'

const crypto = require('hypercore-crypto')
const b4a = require('b4a')

function randomNonce() {
  return b4a.toString(crypto.randomBytes(32), 'hex')
}

function commitHash(pick, nonce) {
  return b4a.toString(crypto.hash(b4a.from(pick + '\n' + nonce)), 'hex')
}

function verify(pick, nonce, hash) {
  return commitHash(pick, nonce) === hash
}

module.exports = { randomNonce, commitHash, verify }
