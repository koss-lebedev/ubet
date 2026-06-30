const test = require('brittle')
const { predictionsToReveal } = require('../workers/lib/session.js')

const preds = [
  { id: 'a', status: 'committed' },
  { id: 'b', status: 'committed' },
  { id: 'c', status: 'revealed' },
  { id: 'd', status: 'invalid' }
]

test('returns committed ids that we hold a secret for', (t) => {
  t.alike(predictionsToReveal(['a', 'b', 'x'], preds), ['a', 'b'])
})

test('excludes already revealed/invalid and unknown secrets', (t) => {
  t.alike(predictionsToReveal(['c', 'd'], preds), [])
  t.alike(predictionsToReveal([], preds), [])
})
