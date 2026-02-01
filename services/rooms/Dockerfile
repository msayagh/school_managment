FROM node:18-alpine

WORKDIR /app

# Copy shared utilities
COPY shared/ /app/shared/

# Copy package files
COPY services/rooms/package*.json ./

# Install dependencies
RUN npm install

# Copy service code
COPY services/rooms/src/ ./src/

# Create logs directory
RUN mkdir -p /app/logs

# Expose port
EXPOSE 3004

# Start the service
CMD ["npm", "start"]
