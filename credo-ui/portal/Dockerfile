# BUILD
FROM node:20-alpine AS build
WORKDIR /app
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
COPY --from=build /app/public ./public
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/.next/standalone ./

EXPOSE 5000
CMD ["node", "server.js"]
