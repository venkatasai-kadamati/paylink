# Build from repository root:
#   docker build -f cloud_project/docker/frontend.Dockerfile -t paylink-frontend .
FROM node:24-alpine AS deps
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./
# ALB routes /api/* to the backend target group, so browser /api traffic never
# hits Next.js. Keep a rewrite target for local-parity builds.
ENV BACKEND_URL=http://127.0.0.1:8000
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S paylink && adduser -S paylink -G paylink
RUN mkdir -p ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
USER paylink
EXPOSE 3000
CMD ["node", "server.js"]
