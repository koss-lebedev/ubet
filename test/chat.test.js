const test = require('brittle')
const fs = require('fs')
const path = require('path')
const Module = require('module')
const { transformSync } = require('esbuild')

// chat.ts is a pure module whose only imports are `import type` (erased at
// compile), so we can transpile the real source and load it with no deps.
function loadChat() {
  const src = fs.readFileSync(path.join(__dirname, '../renderer/src/lib/chat.ts'), 'utf-8')
  const { code } = transformSync(src, { loader: 'ts', format: 'cjs' })
  const m = new Module('chat.ts')
  m._compile(code, 'chat.ts')
  return m.exports
}

const { buildFeed } = loadChat()

const MATCH = { id: 'm1', teamA: {}, teamB: {}, status: 'open', createdAt: 1000 }

test('built feed is chronological with correct event labels', (t) => {
  const match = {
    ...MATCH,
    status: 'locked',
    lockedAt: 3000,
    resultAt: 4000,
    result: { a: 2, b: 1 }
  }
  const predictions = [{ author: 'a', authorName: 'Ada', status: 'revealed', committedAt: 2000 }]
  const messages = [
    { author: 'a', authorName: 'Ada', text: 'first', createdAt: 1500, seq: 1 },
    { author: 'b', authorName: 'Lena', text: 'gg', createdAt: 3500, seq: 2 }
  ]
  const feed = buildFeed(match, predictions, messages)
  t.alike(
    feed.map((i) => (i.kind === 'event' ? `E:${i.event}` : `M:${i.text}`)),
    ['E:created', 'M:first', 'E:committed', 'E:closed', 'M:gg', 'E:scored']
  )
  t.is(feed.find((i) => i.kind === 'event' && i.event === 'scored').label, 'Score updated — 2–1')
  t.is(
    feed.find((i) => i.kind === 'event' && i.event === 'committed').label,
    'Ada made a prediction'
  )
})

test('events with missing timestamps are dropped, not piled at zero', (t) => {
  // locked but no lockedAt (old data); no result
  const match = { ...MATCH, status: 'locked' }
  const predictions = [{ author: 'a', authorName: 'Ada', status: 'committed' }] // no committedAt
  const feed = buildFeed(match, predictions, [])
  t.alike(
    feed.map((i) => i.kind === 'event' && i.event),
    ['created']
  )
})

test('scored event requires a result even if resultAt is set', (t) => {
  const match = { ...MATCH, status: 'locked', resultAt: 4000 }
  const feed = buildFeed(match, [], [])
  t.absent(feed.find((i) => i.kind === 'event' && i.event === 'scored'))
})

test('messages at equal timestamp order by seq; events precede messages', (t) => {
  const match = { ...MATCH, createdAt: 1000 }
  const messages = [
    { author: 'b', authorName: 'Lena', text: 'second', createdAt: 1000, seq: 5 },
    { author: 'a', authorName: 'Ada', text: 'first', createdAt: 1000, seq: 4 }
  ]
  const feed = buildFeed(match, [], messages)
  t.alike(
    feed.map((i) => (i.kind === 'event' ? `E:${i.event}` : `M:${i.text}`)),
    ['E:created', 'M:first', 'M:second']
  )
})

test('empty inputs produce an empty feed', (t) => {
  const match = { ...MATCH }
  delete match.createdAt
  t.alike(buildFeed(match, [], []), [])
})
