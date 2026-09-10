FROM 192.168.49.2:30002/library/node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV production

COPY package.json next.config.ts ./
COPY .next/standalone ./
COPY .next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
