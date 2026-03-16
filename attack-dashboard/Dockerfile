# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# next.config.ts의 output: 'standalone' 설정으로 최소 런타임 번들 생성
RUN npm run build

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# standalone 출력물: server.js + 필요한 node_modules만 포함
COPY --from=builder --chown=appuser:appgroup /app/.next/standalone ./
# 정적 에셋 (_next/static)
COPY --from=builder --chown=appuser:appgroup /app/.next/static ./.next/static

USER appuser

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 환경 변수는 ECS 태스크 정의에서 런타임 주입
# VULNERABLE_API_URL, AWS_API_URL, AWS_S3_BUCKET, VULNERABLE_S3_BUCKET, AWS_REGION

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/config',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
