import { createHash } from "node:crypto"
import { INFINITY_EXPIRE_SENTINEL, INFINITY_TTL_SEC } from "./types.ts"
import type { StoredTagEntry } from "./types.ts"

export function hashCacheKey(cacheKey: string): string {
  return createHash("sha256").update(cacheKey).digest("hex")
}

export function encodeExpire(expire: number): number {
  return Number.isFinite(expire) ? expire : INFINITY_EXPIRE_SENTINEL
}

export function decodeExpire(expire: number): number {
  return expire === INFINITY_EXPIRE_SENTINEL ? Number.POSITIVE_INFINITY : expire
}

export function entryTtlSec(expire: number, revalidate: number): number {
  const expireSec = Number.isFinite(expire) ? expire : INFINITY_TTL_SEC
  return Math.max(expireSec, revalidate, 1)
}

export function areTagsExpired(
  manifest: Map<string, StoredTagEntry>,
  tags: string[],
  timestamp: number,
): boolean {
  const now = Date.now()
  for (const tag of tags) {
    const expiredAt = manifest.get(tag)?.expired
    if (typeof expiredAt === "number" && expiredAt <= now && expiredAt > timestamp) {
      return true
    }
  }
  return false
}

export function areTagsStale(
  manifest: Map<string, StoredTagEntry>,
  tags: string[],
  timestamp: number,
): boolean {
  for (const tag of tags) {
    const staleAt = manifest.get(tag)?.stale ?? 0
    if (staleAt > timestamp) {
      return true
    }
  }
  return false
}

export async function readStreamToBuffer(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      if (value) {
        chunks.push(value)
      }
    }
  } finally {
    reader.releaseLock()
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

export function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}
