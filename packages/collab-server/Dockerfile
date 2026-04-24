FROM oven/bun:1.2-slim AS base
WORKDIR /app

FROM base AS install
COPY package.json ./
RUN bun install --production

FROM base AS runtime
COPY --from=install /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
ENV PORT=1234
EXPOSE 1234

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
	CMD bun -e "fetch('http://localhost:' + (process.env.PORT || 1234) + '/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "src/index.ts"]
