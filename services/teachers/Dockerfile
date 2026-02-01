FROM node:18-alpine

WORKDIR /app

# Copy shared utilities
COPY shared/ /app/shared/

# Copy package files
COPY services/teachers/package*.json ./

# Install dependencies
RUN npm install

# Copy service code
COPY services/teachers/src/ ./src/

# Create logs directory
RUN mkdir -p /app/logs

# Expose port
EXPOSE 3002

# Start the service
CMD ["npm", "start"]
