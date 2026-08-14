FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY frontend/package*.json frontend/
RUN cd frontend && npm install --ignore-scripts
COPY . .
RUN cd frontend && npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/server.js ./
COPY --from=build /app/db*.js ./
COPY --from=build /app/seed_demo.js ./
COPY --from=build /app/routes ./routes
COPY --from=build /app/middleware ./middleware
COPY --from=build /app/lib ./lib
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/public ./public
COPY --from=build /app/frontend/package.json ./frontend/
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "server.js"]
