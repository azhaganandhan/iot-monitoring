FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_API_URL=http://95.217.220.40:8000/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0"]