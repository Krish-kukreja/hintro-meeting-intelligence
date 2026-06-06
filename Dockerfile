# Stage 1: Build
FROM node:20-slim AS builder
RUN apt-get update -y && apt-get install -y openssl
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate --schema=src/prisma/schema.prisma
RUN npm run build

# Stage 2: Production
FROM node:20-slim
RUN apt-get update -y && apt-get install -y openssl
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/src/prisma/schema.prisma ./src/prisma/schema.prisma
EXPOSE 3000
CMD ["node", "dist/server.js"]
