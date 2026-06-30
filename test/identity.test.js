const test = require('brittle')
const b4a = require('b4a')
const { fingerprint } = require('../workers/lib/identity.js')

test('fingerprint returns first 4 bytes as 8 hex chars', (t) => {
  const key = b4a.from('aabbccddeeff00112233', 'hex')
  t.is(fingerprint(key), 'aabbccdd')
})

test('fingerprint throws on too-short keys', (t) => {
  t.exception(() => fingerprint(b4a.from('aabb', 'hex')))
})
