# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
RUN apk upgrade --no-cache zlib

# Run as non-root user — principle of least privilege
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy only production dependencies and source
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY package.json ./

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

# Secrets are injected at ECS task startup via Secrets Manager → env vars.
# Do NOT pass secrets as Docker build args.
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/app.js"]
