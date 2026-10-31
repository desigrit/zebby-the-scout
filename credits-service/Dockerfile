FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY credits-service ./credits-service
COPY shared ./shared
COPY desktop/online-analysis.ts desktop/online-response.ts desktop/openai-request.ts desktop/anthropic-request.ts desktop/analysis-contracts.ts desktop/analysis-fetch.ts ./desktop/
COPY scripts/build-credits-service.mjs ./scripts/
RUN node scripts/build-credits-service.mjs --standalone
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/credits-service/dist/server.mjs ./server.mjs
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
