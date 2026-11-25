# Build from repository root:
#   docker build -f cloud_project/docker/frontend.Dockerfile -t paylink-frontend .
FROM node:24-alpine AS deps
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY frontend/app ./app
COPY frontend/next.config.ts frontend/tsconfig.json frontend/next-env.d.ts ./
ARG BACKEND_URL=http://127.0.0.1:8000
ARG NEXT_PUBLIC_DEMO_ENABLED=false
ENV BACKEND_URL=${BACKEND_URL}
ENV NEXT_PUBLIC_DEMO_ENABLED=${NEXT_PUBLIC_DEMO_ENABLED}
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S paylink && adduser -S paylink -G paylink
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
USER paylink
EXPOSE 3000
CMD ["node", "server.js"]
