# next-cache-handlers

Redis cache handler for Next.js 16
[`cacheHandlers`](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandlers)
(`"use cache"` / `"use cache: remote"`).

## Install

```bash
pnpm add next-cache-handlers redis
pnpm add -D next@16
```

## Usage

`cacheHandlers` values must be filesystem paths. `next-cache-handlers/redis` is a function that
takes the same config as `createRedisCacheHandler` and returns a path Next can resolve.

```ts
// next.config.ts
import redis from "next-cache-handlers/redis"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  cacheHandlers: {
    default: redis({
      url: process.env.REDIS_URL!,
      database: 1,
      prefix: "myapp",
    }),
    remote: redis({
      url: process.env.REDIS_URL!,
      database: 1,
      prefix: "myapp",
    }),
  },
}

export default nextConfig
```

Call `redis()` with no argument to read environment variables instead:

```ts
const nextConfig: NextConfig = {
  cacheHandlers: {
    default: redis(),
    remote: redis(),
  },
}
```

| Variable                     | Required | Description                                                                                      |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `REDIS_URL`                  | yes      | Redis connection URL. If unset, the handler loads but always misses (so `next build` survives).  |
| `REDIS_DB`                   | no       | Logical Redis database index. Invalid values throw when the handler loads if `REDIS_URL` is set. |
| `NEXT_CACHE_HANDLERS_PREFIX` | no       | Key prefix. Default `next:cache:v1`                                                              |

### Programmatic factory

`createRedisCacheHandler` still returns the handler object (for tests or a local file):

```ts
import { createRedisCacheHandler } from "next-cache-handlers"

const handler = createRedisCacheHandler({
  url: process.env.REDIS_URL!,
  database: 1,
  prefix: "myapp",
})
```
