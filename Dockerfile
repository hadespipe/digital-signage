# Version pinned to the locally verified Bun toolchain; Linux acceptance is pending.
FROM oven/bun:1.4.4-debian AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY admin ./admin
COPY shared ./shared
COPY tv ./tv
RUN bun run build:admin

FROM oven/bun:1.4.4-debian AS runtime
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production && mkdir /data && chown bun:bun /data
COPY --from=build /app/dist/admin ./dist/admin
COPY server ./server
COPY shared ./shared
ENV DATA_DIR=/data PORT=3000
USER bun
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD bun -e 'const r=await fetch("http://127.0.0.1:3000/api/health");process.exit(r.ok?0:1)'
CMD ["bun", "server/index.ts"]
