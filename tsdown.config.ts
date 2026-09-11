import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    redis: "src/redis.ts",
    "redis-env": "src/redis-env.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  fixedExtension: false,
})
