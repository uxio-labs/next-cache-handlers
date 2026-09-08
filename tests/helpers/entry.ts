import { bytesToStream, readStreamToBuffer } from "../../src/protocol.ts"
import type { CacheEntry } from "../../src/types.ts"

export function makeEntry(overrides: Partial<CacheEntry> = {}): CacheEntry {
  return {
    value: bytesToStream(new TextEncoder().encode("hello")),
    tags: ["posts"],
    stale: 300,
    timestamp: 1_700_000_000_000,
    expire: 3600,
    revalidate: 60,
    ...overrides,
  }
}

export function pending(entry: CacheEntry): Promise<CacheEntry> {
  return Promise.resolve(entry)
}

export async function readText(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new TextDecoder().decode(await readStreamToBuffer(stream))
}
