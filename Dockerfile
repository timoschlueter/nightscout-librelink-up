FROM node:20-bookworm-slim AS build-stage

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json /usr/src/app/
RUN npm install

# Bundle app source
COPY . /usr/src/app

# Run tests
RUN npm run test ; \
    rm -r tests coverage

# Compile
RUN npm run build

# Remove devel-only dependencies
RUN npm prune --omit dev

FROM node:20-bookworm-slim
LABEL description="Script written in TypeScript that uploads CGM readings from LibreLink Up to Nightscout"

COPY --from=build-stage /usr/src/app /usr/src/app

WORKDIR /usr/src/app

CMD [ "npm", "run", "start-heroku" ]
