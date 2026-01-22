# BUILD
FROM node:20-alpine AS build

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# RUN
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

COPY --from=build /app .

EXPOSE 5000
CMD ["npm", "run", "start"]
