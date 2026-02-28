FROM node:18-alpine

WORKDIR /app

# Copy shared utilities
COPY shared/ /app/shared/
RUN cd /app/shared && npm install

# Copy package files
WORKDIR /app/services/api-gateway
COPY services/api-gateway/package*.json ./

# Install dependencies
RUN npm install

# Copy service code
COPY services/api-gateway/src/ ./src/

# Create logs directory
RUN mkdir -p /app/logs

# Expose port
EXPOSE 8000

# Start the service
CMD ["npm", "start"]
