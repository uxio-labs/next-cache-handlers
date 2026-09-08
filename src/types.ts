export type Timestamp = number

export const DEFAULT_PREFIX = "next:cache:v1"
export const INFINITY_TTL_SEC = 365 * 24 * 60 * 60
export const INFINITY_EXPIRE_SENTINEL = -1

export interface CacheEntry {
  value: ReadableStream<Uint8Array>
  tags: string[]
  stale: number
  timestamp: Timestamp
  expire: number
  revalidate: number
}

export interface CacheHandler {
  get(cacheKey: string, softTags: string[]): Promise<undefined | CacheEntry>
  set(cacheKey: string, pendingEntry: Promise<CacheEntry>): Promise<void>
  refreshTags(): Promise<void>
  getExpiration(tags: string[]): Promise<Timestamp>
  updateTags(tags: string[], durations?: { expire?: number }): Promise<void>
}

export interface StoredTagEntry {
  expired?: number
  stale?: number
}

export interface SerializedEntry {
  valueB64: string
  tags: string[]
  stale: number
  timestamp: number
  expire: number
  revalidate: number
}

export interface CacheStore {
  getEntry(hash: string): Promise<SerializedEntry | undefined>
  setEntry(hash: string, entry: SerializedEntry, ttlSec: number): Promise<void>
  deleteEntry(hash: string): Promise<SerializedEntry | undefined>
  getTagManifest(): Promise<Record<string, StoredTagEntry>>
  setTagEntries(entries: Record<string, StoredTagEntry>): Promise<void>
  addTagRefs(tag: string, hashes: string[]): Promise<void>
  getTagRefs(tag: string): Promise<string[]>
  removeTagRefs(tag: string, hashes: string[]): Promise<void>
}

export interface RedisCacheHandlerOptions {
  url: string
  database?: number
  prefix?: string
}
