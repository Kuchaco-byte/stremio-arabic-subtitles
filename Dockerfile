FROM node:22-slim

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application source
COPY . .

# Expose port (Render/Heroku usually use dynamic ports, but good to document)
EXPOSE 7000

# Start command
CMD ["node", "server.js"]
