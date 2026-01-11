# Production Dockerfile for ST+ v1.0.2
FROM node:22-bullseye-slim

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies (only production)
RUN npm install --production

# Copy application source
COPY . .

# Expose port
EXPOSE 7000

# Start command
CMD ["node", "server.js"]
