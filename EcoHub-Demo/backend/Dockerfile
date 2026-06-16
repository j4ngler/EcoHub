# --- Base Stage ---
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY package*.json ./
RUN npm install
# Ensure nodemailer and node-cron are installed
RUN npm install nodemailer node-cron @types/nodemailer @types/node-cron --save
COPY prisma ./prisma/
RUN npx prisma generate

# --- Development Stage ---
FROM base AS development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# --- Production Stage ---
FROM base AS production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
