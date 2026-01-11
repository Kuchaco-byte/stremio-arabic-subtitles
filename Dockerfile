# Production Dockerfile for ST+ v1.0.3
FROM node:22-bullseye-slim

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies (only production)
RUN npm install --production && \
    npm cache clean --force

# Copy application source
COPY . .

# Use non-root user for security
USER node

# Expose port
EXPOSE 7000

# Start command
CMD ["node", "server.js"]
