# Multi-stage build for security and efficiency
FROM node:24-alpine AS dependencies

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production --no-audit --ignore-scripts --no-fund && \
    npm cache clean --force

# Production stage
FROM node:24-alpine AS production

# Install dumb-init and security updates
RUN apk add --no-cache dumb-init && \
    apk upgrade --no-cache

# Create non-root user with specific UID/GID
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Create app directory with proper ownership
WORKDIR /app

# Create necessary directories for non-root user
RUN mkdir -p /app/logs /app/tmp && \
    chown -R nodejs:nodejs /app

# Copy dependencies from previous stage
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules
RUN chmod -R 555 node_modules

# Copy application files with proper ownership
COPY --chown=nodejs:nodejs backend/ ./backend/
RUN chmod -R 444 ./backend/
COPY --chown=nodejs:nodejs db.js server.js knexfile.js package*.json ./
RUN chmod 444 db.js server.js knexfile.js package*.json
COPY --chown=nodejs:nodejs frontend/ ./frontend/
RUN find ./frontend -type f -exec chmod 444 {} \; && \
    find ./frontend -type d -exec chmod 555 {} \; && \
    chmod 755 ./frontend/static/img/restaurants
# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "server.js"]