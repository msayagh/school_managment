FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY services/ui/package*.json ./

# Install dependencies
RUN npm install

# Copy UI source code
COPY services/ui/src/ ./src/
COPY services/ui/public/ ./public/

# Expose port
EXPOSE 3000

# Start the service
CMD ["npm", "start"]
