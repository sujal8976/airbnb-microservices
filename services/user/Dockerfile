FROM node:24-alpine3.23 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine3.23
WORKDIR /app
# ENV NODE_ENV=production
COPY --chown=node:node --from=builder /app/dist ./dist
EXPOSE 4001
USER node

CMD ["node", "dist/index.cjs"]