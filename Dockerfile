FROM node:23-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3001
ENV NODE_ENV production
CMD [ "node", "dist/index.js" ]