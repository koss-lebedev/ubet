# ubet

Peer-to-peer prediction pool built on [Autobase](https://github.com/holepunchto/autobase) (multi-writer Hypercore) and [Hyperswarm](https://github.com/holepunchto/hyperswarm).

---

## Append-only log

Each tournament is backed by an Autobase log. Every participant appends signed JSON entries to their own Hypercore; Autobase linearises the writes into a deterministic order and materialises a [Hyperbee](https://github.com/holepunchto/hyperbee) key/value view.

### Entry types

All entries share a `type` discriminator field. Entries marked **host only** are ignored unless appended from the tournament's host key.

| `type`       | Appended by | When                                                               | Payload (besides `type`)               |
| ------------ | ----------- | ------------------------------------------------------------------ | -------------------------------------- |
| `init`       | Host        | Once, at tournament creation                                       | `host`                                 |
| `add-writer` | Host        | Admitting a participant into the multi-writer set                  | `key`, `name`                          |
| `add-match`  | Host only   | Registering a new match                                            | `id`, `teamA`, `teamB`, `createdAt`    |
| `commit`     | Participant | Locking in a hidden prediction while the match is `open`           | `matchId`, `hash`, `name`, `createdAt` |
| `lock`       | Host only   | Closing a match to new predictions                                 | `matchId`, `createdAt`                 |
| `set-result` | Host only   | Recording/correcting the final score of a `locked` match           | `matchId`, `a`, `b`, `createdAt`       |
| `reveal`     | Participant | Auto-appended once the match is `locked`, disclosing score + nonce | `matchId`, `score`, `nonce`            |
| `chat`       | Participant | Posting a message to a match's chat thread                         | `matchId`, `text`, `name`, `createdAt` |

Notes:

- `id` is a 16-char hex string; `matchId` references it.
- `teamA` / `teamB` are ISO 3166-1 alpha-2 codes. Display names, alpha-3 codes, and flag emoji are backfilled from the countries catalog on the renderer side.
- `hash = BLAKE2b(score + '\n' + nonce)` where `score` is `"<a>-<b>"` (e.g. `"2-1"`) and `nonce` is 32 random bytes encoded as hex. `reveal` is verified against the earlier `commit` hash before the prediction is marked valid.
- `createdAt` is a wall-clock epoch-millis timestamp supplied by the writer; used to order the chat feed and its derived system events.
- `chat.text` is trimmed and capped at 2000 characters; empty or over-long messages are dropped, as are entries referencing an unknown `matchId`.

---

## Materialised view (Hyperbee)

The `apply` function reduces the linearised log into a Hyperbee key/value store:

| Key                           | Value                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `meta/host`                   | `"<writer-key-hex>"`                                                                                                     |
| `meta/chatSeq`                | `<number>` — monotonic counter giving chat messages a total order                                                        |
| `writer/<key>`                | `{ "name": "<display-name>" }`                                                                                           |
| `match/<id>`                  | `{ "id", "teamA", "teamB", "status": "open"\|"locked", "createdAt", "lockedAt"?, "result"?: { "a", "b" }, "resultAt"? }` |
| `pred/<matchId>/<author-key>` | `{ "matchId", "author", "authorName", "hash", "status": "committed"\|"revealed"\|"invalid", "score"?, "committedAt" }`   |
| `chat/<matchId>/<padded-seq>` | `{ "matchId", "author", "authorName", "text", "createdAt", "seq" }`                                                      |

---

## Local files

Each tournament directory on disk (`storeDir`) contains:

| File              | Contents                                                                             |
| ----------------- | ------------------------------------------------------------------------------------ |
| `tournament.json` | `{ "key", "name", "createdAt" }` — tournament manifest, written once                 |
| `secrets.json`    | `{ "<matchId>": { "a", "b", "nonce" } }` — plaintext scores and nonces, never shared |
