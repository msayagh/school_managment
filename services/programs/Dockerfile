FROM node:18-alpine

WORKDIR /app

# Copy shared utilities
COPY shared/ /app/shared/
RUN cd /app/shared && npm install

# Copy package files
WORKDIR /app/services/programs
COPY services/programs/package*.json ./

# Install dependencies
RUN npm install

# Copy service code
COPY services/programs/src/ ./src/

# Create logs directory
RUN mkdir -p /app/logs

# Expose port
EXPOSE 3006

# Start the service
CMD ["npm", "start"]
