# cache-fn

Redis cache handler for Next.js 16
[`cacheHandlers`](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandlers)
(`"use cache"` / `"use cache: remote"`).

## Install

```bash
pnpm add cache-fn redis
pnpm add -D next@16
```

## Usage

### Env handler (no local file)

```ts
// next.config.ts
import { createRequire } from "node:module"
import type { NextConfig } from "next"

const require = createRequire(import.meta.url)

const nextConfig: NextConfig = {
  cacheHandlers: {
    default: require.resolve("cache-fn/redis"),
    remote: require.resolve("cache-fn/redis"),
  },
}

export default nextConfig
```

Environment:

| Variable          | Required | Description                                                                                      |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `REDIS_URL`       | yes      | Redis connection URL. If unset, the handler loads but always misses (so `next build` survives).  |
| `REDIS_DB`        | no       | Logical Redis database index. Invalid values throw when the handler loads if `REDIS_URL` is set. |
| `CACHE_FN_PREFIX` | no       | Key prefix. Default `next:cache:v1`                                                              |

### Factory (custom URL / db / prefix)

Create a local file Next can resolve:

```js
// cache-handler.js
import { createRedisCacheHandler } from "cache-fn"

export default createRedisCacheHandler({
  url: process.env.REDIS_URL,
  database: 1,
  prefix: "myapp",
})
```

```ts
// next.config.ts
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

export default {
  cacheHandlers: {
    default: require.resolve("./cache-handler.js"),
    remote: require.resolve("./cache-handler.js"),
  },
}
```
