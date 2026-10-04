FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY credits-service ./credits-service
COPY shared ./shared
COPY desktop/online-analysis.ts desktop/analysis-contracts.ts ./desktop/
COPY scripts/build-credits-service.mjs ./scripts/
RUN node scripts/build-credits-service.mjs && npm prune --omit=dev --ignore-scripts
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/node_modules/zod ./node_modules/zod
COPY --from=build /app/credits-service/dist/server.mjs ./server.mjs
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
