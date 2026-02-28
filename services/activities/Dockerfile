FROM node:18-alpine

WORKDIR /app

# Copy shared utilities
COPY shared/ /app/shared/
RUN cd /app/shared && npm install

# Copy package files
WORKDIR /app/services/activities
# Copy package files
COPY services/activities/package*.json ./

# Install dependencies
RUN npm install

# Copy service code
COPY services/activities/src/ ./src/

# Create logs directory
RUN mkdir -p /app/logs

# Expose port
EXPOSE 3003

# Start the service
CMD ["npm", "start"]
