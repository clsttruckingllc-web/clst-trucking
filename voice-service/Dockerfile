FROM node:20-bookworm-slim
WORKDIR /app
COPY voice-service/package.json ./package.json
RUN npm install --omit=dev
COPY voice-service/server.js ./server.js
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "start"]
