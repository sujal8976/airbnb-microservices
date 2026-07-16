# ==========================================
# Stage 1: Build the application
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first to leverage Docker layer caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies needed for Vite build)
# Using 'npm ci' ensures clean, automated, and repeatable installations
RUN npm ci

# Copy the rest of the application source code
COPY . .

# Build the production-ready static assets (generates the 'dist' directory)
RUN npm run build

# ==========================================
# Stage 2: Serve the application with Nginx
# ==========================================
FROM nginx:1.27-alpine AS runner

# Remove the default Nginx static files
RUN rm -rf /usr/share/nginx/html/*

# Copy the optimized static files from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration for proper React routing handling
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

