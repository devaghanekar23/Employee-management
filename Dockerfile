# ---------- Employee Data Manager ----------
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

# Dependencies pehle copy karo (Docker layer cache ke liye)
COPY package*.json ./
RUN npm ci --omit=dev

# Baaki source code
COPY . .

# Runtime folders (uploads + text file storage)
RUN mkdir -p /app/data /app/public/uploads/avatars \
    && chown -R node:node /app

USER node
EXPOSE 3000

CMD ["node", "server.js"]
