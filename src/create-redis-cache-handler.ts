import { createCacheHandler } from "./create-cache-handler.ts"
import { createRedisStore } from "./redis-store.ts"

import type { CacheHandler, RedisCacheHandlerOptions } from "./types.ts"

export function createRedisCacheHandler(options: RedisCacheHandlerOptions): CacheHandler {
  if (typeof options.url !== "string" || options.url.length === 0) {
    throw new Error("createRedisCacheHandler: url is required")
  }
  if (
    options.database !== undefined &&
    (!Number.isInteger(options.database) || options.database < 0)
  ) {
    throw new Error(
      `createRedisCacheHandler: database must be a non-negative integer, got ${JSON.stringify(options.database)}`,
    )
  }
  return createCacheHandler(createRedisStore(options))
}
