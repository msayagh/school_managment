FROM node:18-alpine

WORKDIR /app

# Copy shared utilities
COPY shared/ /app/shared/
RUN cd /app/shared && npm install

# Copy package files
WORKDIR /app/services/bookings
COPY services/bookings/package*.json ./

# Install dependencies
RUN npm install

# Copy service code
COPY services/bookings/src/ ./src/

# Create logs directory
RUN mkdir -p /app/logs

# Expose port
EXPOSE 3005

# Start the service
CMD ["npm", "start"]
