# ─── Stage 1: dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy manifests first — Docker layer cache means this only reruns on
# package.json changes, not on every source file change
COPY package*.json ./

# Install production deps only in this stage
RUN npm ci --omit=dev

# ─── Stage 2: production image ────────────────────────────────────────────────
FROM node:20-alpine AS production

# dumb-init handles signal forwarding correctly inside Docker
# (Node.js as PID 1 doesn't propagate SIGTERM to child processes by default)
RUN apk add --no-cache dumb-init

WORKDIR /app

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy production node_modules from the deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY src/ ./src/
COPY package.json ./

# Set ownership
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/app.js"]
