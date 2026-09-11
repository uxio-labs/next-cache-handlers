import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"

import { createCacheHandlerAdapter } from "./create-cache-handler-adapter.ts"
import { validateRedisCacheHandlerOptions } from "./create-redis-cache-handler.ts"

import type { RedisCacheHandlerOptions } from "./types.ts"

function resolveFactoryHref(): string {
  const require = createRequire(import.meta.url)
  try {
    return pathToFileURL(require.resolve("next-cache-handlers")).href
  } catch {
    return pathToFileURL(fileURLToPath(new URL("./index.ts", import.meta.url))).href
  }
}

function resolveEnvHandlerPath(): string {
  const ext = import.meta.url.endsWith(".ts") ? ".ts" : ".js"
  return fileURLToPath(new URL(`./redis-env${ext}`, import.meta.url))
}

const resolveConfigured = createCacheHandlerAdapter({
  factoryHref: resolveFactoryHref(),
  factoryName: "createRedisCacheHandler",
})

export function redis(options?: RedisCacheHandlerOptions): string {
  if (options === undefined) {
    return resolveEnvHandlerPath()
  }
  validateRedisCacheHandlerOptions(options)
  return resolveConfigured(options)
}

export default redis
