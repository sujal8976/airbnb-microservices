FROM node:24-alpine3.23 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM gcr.io/distroless/nodejs24-debian12:nonroot
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
EXPOSE 4003

CMD ["dist/index.cjs"]