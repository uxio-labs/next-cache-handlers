import { describe, expect, it } from "vitest"
import {
  INFINITY_EXPIRE_SENTINEL,
  INFINITY_TTL_SEC,
} from "../src/types.ts"
import {
  areTagsExpired,
  areTagsStale,
  bytesToStream,
  decodeExpire,
  encodeExpire,
  entryTtlSec,
  hashCacheKey,
  readStreamToBuffer,
} from "../src/protocol.ts"

describe("hashCacheKey", () => {
  it("returns a stable sha256 hex digest", () => {
    const a = hashCacheKey("posts:1")
    const b = hashCacheKey("posts:1")
    const c = hashCacheKey("posts:2")
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe("expire sentinel", () => {
  it("round-trips Infinity through -1", () => {
    expect(encodeExpire(Number.POSITIVE_INFINITY)).toBe(INFINITY_EXPIRE_SENTINEL)
    expect(decodeExpire(INFINITY_EXPIRE_SENTINEL)).toBe(Number.POSITIVE_INFINITY)
    expect(encodeExpire(3600)).toBe(3600)
    expect(decodeExpire(3600)).toBe(3600)
  })
})

describe("entryTtlSec", () => {
  it("uses max(expire, revalidate, 1)", () => {
    expect(entryTtlSec(10, 60)).toBe(60)
    expect(entryTtlSec(120, 60)).toBe(120)
    expect(entryTtlSec(0, 0)).toBe(1)
  })

  it("uses one year when expire is Infinity", () => {
    expect(entryTtlSec(Number.POSITIVE_INFINITY, 60)).toBe(INFINITY_TTL_SEC)
  })
})

describe("tag freshness", () => {
  it("treats a tag as expired when expiredAt is after the entry timestamp and not in the future", () => {
    const now = Date.now()
    const manifest = new Map([
      ["posts", { expired: now - 10 }],
    ])
    expect(areTagsExpired(manifest, ["posts"], now - 1000)).toBe(true)
    expect(areTagsExpired(manifest, ["posts"], now)).toBe(false)
    expect(areTagsExpired(manifest, ["other"], now - 1000)).toBe(false)
  })

  it("treats a tag as stale when staleAt is after the entry timestamp", () => {
    const manifest = new Map([["posts", { stale: 2000 }]])
    expect(areTagsStale(manifest, ["posts"], 1000)).toBe(true)
    expect(areTagsStale(manifest, ["posts"], 2000)).toBe(false)
  })
})

describe("streams", () => {
  it("round-trips bytes through a ReadableStream", async () => {
    const stream = bytesToStream(Buffer.from("hello"))
    const body = await readStreamToBuffer(stream)
    expect(Buffer.from(body).toString("utf8")).toBe("hello")
  })

  it("rejects when the stream errors", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("partial"))
        controller.error(new Error("boom"))
      },
    })
    await expect(readStreamToBuffer(stream)).rejects.toThrow("boom")
  })
})
