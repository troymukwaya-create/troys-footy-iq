FROM node:20-alpine AS builder
WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --production && npm cache clean --force

# Copy application code
COPY . .

# Remove dev files
RUN rm -rf .env backend.log node_modules/.cache

# ─── Production image ───────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy from builder
COPY --from=builder --chown=appuser:appgroup /app .

# Environment
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

USER appuser

CMD ["node", "server.js"]
