FROM node:18-alpine

WORKDIR /app

# Copy shared utilities
COPY shared/ /app/shared/
RUN cd /app/shared && npm install

# Copy package files
WORKDIR /app/services/teachers
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
