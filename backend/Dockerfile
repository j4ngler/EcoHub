FROM node:20-alpine

WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl libc6-compat

# Install dependencies
COPY package*.json ./
RUN npm install
# Ensure nodemailer and node-cron are installed
RUN npm install nodemailer node-cron @types/nodemailer @types/node-cron --save

# Copy prisma schema
COPY prisma ./prisma/

# Generate Prisma Client
RUN npx prisma generate

# Copy source code
COPY . .

# Generate Prisma Client (already done above, but ensure it's available)
RUN npx prisma generate

EXPOSE 3000

# Run in dev mode (no build needed)
CMD ["npm", "run", "dev"]
