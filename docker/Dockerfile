FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY backend/ ./backend/
COPY db.js server.js knexfile.js ./
COPY frontend/ ./frontend/

EXPOSE 3000
CMD ["node", "server.js"]
# docker/Dockerfile
