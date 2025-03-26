FROM node:18-alpine

WORKDIR /app

COPY package.json ./

RUN apk add --no-cache --virtual .gyp python3 make g++ \

RUN npm install --build-from-source

COPY . .

RUN npx prisma generate

CMD ["npm", "run", "start"]