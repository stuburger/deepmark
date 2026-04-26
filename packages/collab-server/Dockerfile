# Hocuspocus 4.x imports `crossws/adapters/node`, which throws under Bun.
# We install with Bun (workspace lockfile) but run with Node + tsx.

FROM oven/bun:1.2-slim AS install
WORKDIR /app
COPY package.json ./
RUN bun install --production

FROM node:22-slim AS runtime
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
ENV PORT=1234
EXPOSE 1234

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
	CMD node -e "fetch('http://localhost:' + (process.env.PORT || 1234) + '/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "--import", "tsx", "src/index.ts"]
