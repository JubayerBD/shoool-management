# Multi-stage build: build the client, then run the API which also serves it.
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20-alpine AS server
WORKDIR /app/server
ENV NODE_ENV=production
ENV SERVE_CLIENT=true
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
# Bring in the built client so the API can serve it at "/".
COPY --from=client-build /app/client/dist /app/client/dist
EXPOSE 5000
CMD ["node", "src/server.js"]
