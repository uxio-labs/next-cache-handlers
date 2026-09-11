import { createCacheHandlerFactory } from "./create-cache-handler.ts"
import { createRedisStore } from "./redis-store.ts"

import type { RedisCacheHandlerOptions } from "./types.ts"

export function validateRedisCacheHandlerOptions(options: RedisCacheHandlerOptions): void {
  if (typeof options.url !== "string" || options.url.length === 0) {
    throw new Error("createRedisCacheHandler: url is required")
  }
  if (
    options.database !== undefined &&
    (!Number.isSafeInteger(options.database) || options.database < 0)
  ) {
    throw new Error(
      `createRedisCacheHandler: database must be a non-negative integer, got ${JSON.stringify(options.database)}`,
    )
  }
}

export const createRedisCacheHandler = createCacheHandlerFactory(
  (options: RedisCacheHandlerOptions) => {
    validateRedisCacheHandlerOptions(options)
    return createRedisStore(options)
  },
)
