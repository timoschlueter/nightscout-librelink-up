# Nightscout LibreLink Up Uploader/Sidecar
Simple Script written in JavaScript (Node) that uploads CGM readings from LibreLink Up to Nightscout. The upload happens every minute and should work with at least Freestyle Libre 2 and Libre 3 CGM sensors.

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/timoschlueter/nightscout-librelink-up)

## Configuration
The script takes the following environment variables

|Variable|Description|Example|
|---|---|---|
|LINK_UP_USERNAME|LibreLink Up Login Email|mail@example.com|
|LINK_UP_PASSWORD|LibreLink Up Login Password|mypassword|
|NIGHTSCOUT_URL|Hostname of the Nightscout instance (without https://)|nightscout.yourdomain.com|
|NIGHTSCOUT_API_TOKEN|Nightscout access token|librelinku-123456789abcde|

## Usage
There are different options for using this script.

### Variant 1: Local

The installation process can be startetd by running `npm install` in the root directory.

To start the process simply create a bash script with the set environment variables (`start.sh`):

```
#!/bin/bash
export LINK_UP_USERNAME="mail@example.com"
export LINK_UP_PASSWORD="mypassword"
export NIGHTSCOUT_URL="nightscout.yourdomain.com"
export NIGHTSCOUT_API_TOKEN="librelinku-123456789abcde"

npm start
```

Execute the script and check the console output.

### Variant 2: Docker
The easiest way to use this is to use the latest docker image:

```
docker run -e LINK_UP_USERNAME="mail@example.com" \
            -e LINK_UP_PASSWORD="mypassword" \
            -e NIGHTSCOUT_URL="nightscout.yourdomain.com" \
            -e NIGHTSCOUT_API_TOKEN="librelinku-123456789abcde" timoschlueter/nightscout-librelink-up
```

### Variant 3: Docker Compose
If you are already using a dockerized Nightscout instance, this image can be easily added to your existing docker-compose file:

```
version: '3.7'

services:
  nightscout-libre-link:
    image: timoschlueter/nightscout-librelink-up
    container_name: nightscout-libre-link
    environment:
      LINK_UP_USERNAME: "mail@example.com"
      LINK_UP_PASSWORD: "mypassword"
      NIGHTSCOUT_URL: "nightscout.yourdomain.com"
      NIGHTSCOUT_API_TOKEN: "librelinku-123456789abcde"
```

## ToDo
- **Enable multiple readings**: Currently the script takes the first persons glucose data that the configured account has been given access to via LibreLink Up. This should either be configurable or automatically get every persons measurements
- **Integration into Nightscout**: I have not yet looked into the plugin architecture of Nightscout. Maybe this should be converted into a plugin.
