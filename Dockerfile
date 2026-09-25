FROM node:22-bookworm AS node
FROM mcr.microsoft.com/playwright:v1.63.0-noble
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -sf ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
RUN mkdir -p /data && chown pwuser:pwuser /data
USER pwuser
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
