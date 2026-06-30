# ubet

Peer-to-peer prediction pool built on [Autobase](https://github.com/holepunchto/autobase) (multi-writer Hypercore) and [Hyperswarm](https://github.com/holepunchto/hyperswarm).

---

## Append-only log

Each room is backed by an Autobase log. Every participant appends signed JSON entries to their own Hypercore; Autobase linearises the writes into a deterministic order and materialises a [Hyperbee](https://github.com/holepunchto/hyperbee) key/value view.

### Entry types

All entries share a `type` discriminator field.

#### `init`

Appended once by the host when a room is created.

```json
{ "type": "init", "host": "<writer-key-hex>" }
```

#### `add-writer`

Appended by the host to admit a new participant into the multi-writer set.

```json
{ "type": "add-writer", "key": "<writer-key-hex>", "name": "<display-name>" }
```

#### `add-match`

Appended by the host to register a new match. Only accepted from the host key.

```json
{
  "type": "add-match",
  "id": "<16-char-hex>",
  "teamA": "AR",
  "teamB": "BR",
  "createdAt": 1719700000000
}
```

`teamA` and `teamB` are ISO 3166-1 alpha-2 codes. Display names, alpha-3 codes, and flag emoji are backfilled from the countries catalog on the renderer side.

#### `commit`

Appended by a participant to lock in a prediction before the match is sealed. The actual score is hidden behind a hash commitment.

```json
{
  "type": "commit",
  "matchId": "<16-char-hex>",
  "hash": "<blake2b-hex>",
  "name": "<display-name>"
}
```

`hash = BLAKE2b(score + '\n' + nonce)` where `score` is `"<a>-<b>"` (e.g. `"2-1"`) and `nonce` is 32 random bytes encoded as hex.

#### `lock`

Appended by the host to close a match to new predictions. Only accepted from the host key.

```json
{ "type": "lock", "matchId": "<16-char-hex>" }
```

#### `reveal`

Appended automatically by each participant once their match is locked, disclosing the score and nonce used at commit time. The log verifies the hash before marking the prediction valid.

```json
{
  "type": "reveal",
  "matchId": "<16-char-hex>",
  "score": "2-1",
  "nonce": "<64-char-hex>"
}
```

---

## Materialised view (Hyperbee)

The `apply` function reduces the linearised log into a Hyperbee key/value store:

| Key | Value |
|-----|-------|
| `meta/host` | `"<writer-key-hex>"` |
| `writer/<key>` | `{ "name": "<display-name>" }` |
| `match/<id>` | `{ "id", "teamA", "teamB", "status": "open"\|"locked", "createdAt" }` |
| `pred/<matchId>/<author-key>` | `{ "matchId", "author", "authorName", "hash", "status": "committed"\|"revealed"\|"invalid", "score"? }` |

---

## Local files

Each room directory on disk (`storeDir`) contains:

| File | Contents |
|------|----------|
| `room.json` | `{ "key", "name", "createdAt" }` — room manifest, written once |
| `secrets.json` | `{ "<matchId>": { "a", "b", "nonce" } }` — plaintext scores and nonces, never shared |
