FROM node:18-alpine

WORKDIR /app

# Copy shared utilities
COPY shared/ /app/shared/
RUN cd /app/shared && npm install

# Copy package files
WORKDIR /app/services/auth
COPY services/auth/package*.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY services/auth/src/ ./src/

# Set production environment
ENV NODE_ENV=production

EXPOSE 3007

CMD ["node", "src/index.js"]
