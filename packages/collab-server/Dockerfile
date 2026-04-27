# Build context is the monorepo root (see infra/collab.ts) — Bun workspaces
# require a root manifest to resolve `workspace:*` deps.
#
# We synthesise a *minimal* root package.json that declares only the two
# workspaces this image actually needs (shared + collab-server). The real
# root package.json drags in apps/web's Next.js + packages/backend's AWS
# SDKs etc. — ~600 packages of cruft for a service that needs ~50.
#
# Hocuspocus 4.x imports `crossws/adapters/node`, which throws under Bun.
# We install with Bun (fast resolver) but execute the runtime with Node + tsx.

FROM oven/bun:1.2-slim AS build
WORKDIR /app

# Real root tsconfig is empty — packages/shared/tsconfig.json `extends` it,
# so we still need a file at this path.
RUN printf '{}\n' > tsconfig.json
RUN printf '{"name":"deepmark-collab-build","private":true,"workspaces":["packages/shared","packages/collab-server"]}\n' > package.json

COPY packages/shared/package.json ./packages/shared/
COPY packages/collab-server/package.json ./packages/collab-server/
RUN bun install

# Build shared — collab-server imports its `exports./collab` entry which
# points at dist/, so dist must exist at runtime.
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
RUN cd packages/shared && bun run build

# Collab-server source (executed as .ts via tsx — no build step).
COPY packages/collab-server/tsconfig.json ./packages/collab-server/
COPY packages/collab-server/src ./packages/collab-server/src

FROM node:22-slim AS runtime
WORKDIR /app

# Copy the entire built workspace tree. node_modules contains Bun's
# symlink graph (e.g. node_modules/@mcp-gcse/shared → ../packages/shared)
# whose targets live under packages/, so both must be present together.
COPY --from=build /app /app

WORKDIR /app/packages/collab-server

ENV NODE_ENV=production
ENV PORT=1234
EXPOSE 1234

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
	CMD node -e "fetch('http://localhost:' + (process.env.PORT || 1234) + '/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "--import", "tsx", "src/index.ts"]
