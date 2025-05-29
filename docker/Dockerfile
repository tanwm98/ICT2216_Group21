FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY backend/ ./backend/
COPY db.js server.js ./
EXPOSE 3000
CMD ["node", "server.js"]
