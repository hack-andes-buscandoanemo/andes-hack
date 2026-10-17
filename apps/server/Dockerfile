# Production image for the andes-hack server.
# Build from the repository root so workspace packages resolve:
#   docker build -f apps/server/Dockerfile .

FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS builder
COPY . .
RUN if [ -f bun.lock ]; then bun install --frozen-lockfile; else bun install; fi
RUN bun run --filter server build

# Production dependencies of the server workspace, without dev dependencies.
FROM base AS deps
COPY . .
# The workspaces' own install scripts (Git hook setup, prisma generate) need dev tools
# that this stage leaves out. The builder stage already ran them, and the runner takes
# what they produced from there, so drop them here. Dependencies keep their install
# scripts, so native modules still build.
RUN bun -e 'const fs = require("fs"); \
  const dirs = ["apps", "packages"].filter((root) => fs.existsSync(root)) \
    .flatMap((root) => fs.readdirSync(root).map((name) => root + "/" + name)); \
  for (const dir of [".", ...dirs]) { \
    const file = dir + "/package.json"; \
    if (!fs.existsSync(file)) continue; \
    const pkg = JSON.parse(fs.readFileSync(file, "utf8")); \
    for (const name of ["preinstall", "install", "postinstall", "preprepare", "prepare", "postprepare"]) delete pkg.scripts?.[name]; \
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2)); \
  }'
RUN if [ -f bun.lock ]; then bun install --production --frozen-lockfile --filter server; else bun install --production --filter server; fi
# Hoisting package managers may leave this empty; the runner copies it either way.
RUN mkdir -p apps/server/node_modules

FROM oven/bun:1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/server/dist ./apps/server/dist
WORKDIR /app/apps/server
EXPOSE 3000
CMD ["bun", "run", "dist/index.mjs"]
