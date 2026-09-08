# next-cache-handlers — Next.js `cacheHandlers` library

Date: 2026-09-08

## Problem

Next.js 16 `'use cache'` / `'use cache: remote'` store entries in process memory by default. Multiple instances do not share that cache, and it is lost on restart.

Next.js configures custom storage through `cacheHandlers`, which must be **filesystem paths** to modules whose **default export** is a `CacheHandler`. A factory result cannot be passed in `next.config`.

This package ships a Redis handler that apps can resolve with `require.resolve("next-cache-handlers/redis")`, plus a factory for custom URL / database / prefix. Memcached and DynamoDB are planned later; v1 is Redis only.

Reference implementation: `acme-website/cache-handlers/redis.ts`.

## Goals

- Drop-in Redis handler for Next.js 16 `cacheHandlers` (`default` and `remote`).
- Factory for non-env configuration (URL, optional database, optional key prefix).
- Shared Next.js handler logic so later backends do not recopy tag/stream/pending-set behavior.
- Tests: unit (fake store) and integration (Testcontainers Redis).
- Short README: install + usage only.

## Non-goals (v1)

- Legacy ISR `cacheHandler` (singular).
- Injected / pre-connected Redis client.
- `ioredis`, Memcached, DynamoDB.
- CLI or leftover polar-template utilities.
- Next.js app fixture / Playwright e2e.

## Public API

ESM package. Peers: `next` `^16`. Optional peer: `redis` (required to use the Redis handler).

Exports:

| Specifier | Contents |
|---|---|
| `next-cache-handlers` | `createRedisCacheHandler`, `createCacheHandler`, `CacheStore` type, related types |
| `next-cache-handlers/redis` | Default-export env handler |

### Env handler

```ts
// next.config.ts
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)

const nextConfig = {
  cacheHandlers: {
    default: require.resolve("next-cache-handlers/redis"),
    remote: require.resolve("next-cache-handlers/redis"),
  },
}
```

Reads:

- `REDIS_URL` — connection URL. If missing, warn once and behave as always-miss (so `next build` / import succeed).
- `REDIS_DB` — optional non-negative integer (`SELECT`). Invalid values throw when the client is first created.
- `NEXT_CACHE_HANDLERS_PREFIX` — optional key prefix. Default `next:cache:v1`.

Must not connect at import time. Next loads this module during `next build`.

### Factory

```ts
createRedisCacheHandler(options: {
  url: string
  database?: number
  prefix?: string
}): CacheHandler
```

Missing `url` throws at create time. Default `prefix` is `next:cache:v1`.

Consumers who need options write a local file and point Next at it:

```js
import { createRedisCacheHandler } from "next-cache-handlers"

export default createRedisCacheHandler({
  url: process.env.REDIS_URL,
  database: 1,
  prefix: "myapp",
})
```

## Architecture

Three layers:

1. **Handler** — `createCacheHandler(store)` implements Next’s `CacheHandler`. Owns pending sets, stream read/rebuild, tag freshness, and the error policy.
2. **Protocol** — SHA-256 cache-key hashing, `SerializedEntry` JSON, local tag manifest, freshness helpers.
3. **Store** — backend I/O only. Redis is the v1 store. Later backends implement the same interface.

Leftover template files (`src/cli.ts`, polar docs/plans, `store-fn` bin, unused polar tsdown entries) are removed during implementation. They are not part of this library.

## CacheStore

Small enough that Memcached/Dynamo can implement it later without Redis-specific types leaking:

```ts
interface StoredTagEntry {
  expired?: number
  stale?: number
}

interface SerializedEntry {
  valueB64: string
  tags: string[]
  stale: number
  timestamp: number
  expire: number
  revalidate: number
}

interface CacheStore {
  getEntry(hash: string): Promise<SerializedEntry | undefined>
  setEntry(hash: string, entry: SerializedEntry, ttlSec: number): Promise<void>
  deleteEntry(hash: string): Promise<SerializedEntry | undefined>

  getTagManifest(): Promise<Record<string, StoredTagEntry>>
  setTagEntries(entries: Record<string, StoredTagEntry>): Promise<void>

  addTagRefs(tag: string, hashes: string[]): Promise<void>
  getTagRefs(tag: string): Promise<string[]>
  removeTagRefs(tag: string, hashes: string[]): Promise<void>
}
```

Redis key layout (prefix defaults to `next:cache:v1`):

- Entry: `{prefix}:e:{sha256(cacheKey)}`
- Tag refs: `{prefix}:r:{base64url(tag)}` — Redis set of entry hashes
- Tag manifest: `{prefix}:tags` — Redis hash of tag → `StoredTagEntry` JSON

`createRedisStore` uses `redis` (`createClient`). Lazy `connect()` on first operation. Optional `database` is passed as `database` to the client.

## Handler behavior

Based on the acme Redis handler. Intentional differences: check soft tags and explicit tags in `get`; do not treat `revalidate` as a hard miss (Next uses `expire` for that and `revalidate` for SWR).

### `set(cacheKey, pendingEntry)`

1. Register a pending promise for `cacheKey` so a concurrent `get` waits.
2. Await `pendingEntry`. Read `value` to completion. On stream error, discard (no partial write).
3. Persist `SerializedEntry` with TTL `max(expire, revalidate, 1)`. If `expire` is `Infinity`, use 365 days.
4. Add the entry hash to each tag’s ref set.
5. Always clear the pending promise.

### `get(cacheKey, softTags)`

1. Await a pending `set` for the same key if one exists.
2. Load the entry. Missing or malformed JSON → `undefined`.
3. Miss if any **explicit** `entry.tags` or **soft** `softTags` was invalidated after `entry.timestamp` (explicit tags are not checked by Next across instances; the handler must).
4. If tags are stale (soft revalidate), return the entry with `revalidate: -1`.
5. Return a **new** `ReadableStream` over the stored bytes every time.

Do not also miss solely because `now > timestamp + revalidate * 1000`. Next serves entries past `revalidate` but within `expire` and refreshes in the background. Hard time expiry is Next’s job via `expire`. Redis TTL is a safety net.

### Tags

- `updateTags(tags, durations?)` updates the local manifest, writes it to the store, then deletes every entry listed in those tags’ ref sets (and drops the refs).
  - `durations` omitted: set `expired` to now (immediate expire).
  - `durations` present: set `stale` to now; if `durations.expire` is set, set `expired` to `now + expire * 1000`.
- `refreshTags()` replaces the process-local manifest from `getTagManifest()`.
- `getExpiration(tags)` returns `max(expired timestamps, 0)` from the local manifest.

## Error policy

Cache failures degrade to extra renders. They must not take down the app.

| Path | On failure |
|---|---|
| `get` | Return `undefined`. Never throw. |
| `set` | Log and ignore. Never throw. Discard partial streams. |
| `refreshTags` | Keep the last local manifest. Never throw. |
| `getExpiration` | Return `0`. |
| `updateTags` with `durations.expire === 0` | Propagate (hard expire / `updateTag`). |
| Other `updateTags` | Log and ignore. |
| Missing `REDIS_URL` on `next-cache-handlers/redis` | Warn once; always-miss. |
| Missing `url` on `createRedisCacheHandler` | Throw at create time. |
| Redis client `error` events | Log, do not throw. |

## Testing

Vitest. Two suites.

### Unit — `createCacheHandler` + in-memory `CacheStore`

- miss / hit
- concurrent `get` waits for in-flight `set`
- stream error on `set` does not persist
- explicit-tag invalidation misses after `updateTags`
- soft-tag invalidation misses
- stale tags return `revalidate: -1`
- `expire: Infinity` is stored with a one-year TTL
- `get` / `refreshTags` return miss / succeed when the store rejects
- hard `updateTags({ expire: 0 })` propagates store errors
- env handler with no `REDIS_URL` is always-miss

### Integration — Testcontainers Redis

- set then get round-trips bytes and metadata
- Redis TTL is set on the entry key
- `updateTags` deletes tagged entries
- a second handler instance sees tag updates after `refreshTags`
- two prefixes on one Redis do not share keys
- `createRedisCacheHandler` without `url` throws

## README

Install `next-cache-handlers`, `redis`, and `next@16`. Document the two wiring styles (package path and factory wrapper), the three env vars, and that `cacheHandlers` values must be resolved paths, not factory results.

## Implementation notes

- Keep `createCacheHandler` free of Redis types so unit tests never import `redis`.
- Ship compiled JS + d.ts via existing tsdown. Add a `./redis` entry (no CLI bundle).
- `redis` is `peerDependencies` and `peerDependenciesMeta.optional: true`, and a `devDependency` for tests.
- Do not import `next/dist/server/lib/cache-handlers/types` from published files if that path is unstable; copy the small `CacheHandler` / `CacheEntry` shapes (or depend on public types if Next exports them). Published code must typecheck against `next@16` as a peer.
