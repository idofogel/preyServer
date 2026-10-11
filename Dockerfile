FROM node:22-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
RUN npx prisma generate

COPY --from=builder /app/dist ./dist

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
