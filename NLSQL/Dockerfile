FROM node:20-slim

# better-sqlite3 needs python + build tools for native compilation
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json .
RUN npm install

COPY src/ ./src/

EXPOSE 4000

CMD ["node", "src/index.js"]

