FROM node:22-bookworm-slim
WORKDIR /app
COPY voice-service/package.json ./package.json
RUN npm install --omit=dev
COPY voice-service/server.js ./server.js
COPY voice-service/sip-inbound-openai.mjs ./sip-inbound-openai.mjs
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "run", "start:ai"]
