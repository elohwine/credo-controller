# BUILD
FROM node:20-alpine AS build
# Mirror the repo layout so ../shared and ../../src/config resolve (see docker-compose.full.yml).
WORKDIR /repo/credo-ui/portal
COPY --from=shared . /repo/credo-ui/shared
COPY --from=orgconfig orgModules.ts /repo/src/config/orgModules.ts
COPY package.json package-lock.json* ./
# Mount npm cache for faster recurrent builds
RUN --mount=type=cache,target=/root/.npm npm ci --legacy-peer-deps
COPY . .
RUN npm run build

# RUN
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

# Copy only necessary files for standalone mode
COPY --from=build /repo/credo-ui/portal/public ./public
COPY --from=build /repo/credo-ui/portal/.next/static ./.next/static
COPY --from=build /repo/credo-ui/portal/.next/standalone ./

EXPOSE 5000
CMD ["node", "server.js"]
