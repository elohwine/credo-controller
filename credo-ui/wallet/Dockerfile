# BUILD
FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
# Mount npm cache for faster recurrent builds
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build

# RUN
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

COPY --from=build /app/.output ./.output
# Nuxt output often contains necessary node_modules in .output/server/node_modules,
# but if explicitly needed:
COPY --from=build /app/package.json ./package.json
# Production stage might not need full node_modules if standalone, but Nuxt output structure varies.
# Keeping existing pattern but can be optimized if needed.
COPY --from=build /app/node_modules ./node_modules

EXPOSE 4000
ENTRYPOINT [ "node", ".output/server/index.mjs" ]