FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html ./
COPY src ./src
COPY scripts/serve.mjs ./scripts/serve.mjs
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts
COPY package.json ./
USER node
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-4173}/" >/dev/null || exit 1
CMD ["node", "scripts/serve.mjs"]
