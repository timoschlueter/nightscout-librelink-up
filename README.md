# Nightscout LibreLink Up Uploader
Simple Script written in JavaScript (Node) that uploads CGM readings from LibreLink Up to Nightscout

## Installation (only required if not using Docker)
Simply run `npm install` and you are good to go.

## Configuration
The script takes the following environment variables

|Variable|Description|Example|
|---|---|---|
|LINK_UP_USERNAME|LibreLink Up Login Email|mail@example.com|
|LINK_UP_PASSWORD|LibreLink Up Login Password|mypassword|
|NIGHTSCOUT_URL|Hostname of the Nightscout instance (without https://)|nightscout.yourdomain.com|
|NIGHTSCOUT_API_TOKEN|Nightscout access token|librelinku-123456789abcde|

## Usage (Node)
To use this script, simply create a bash script (`start.sh`):

```
#!/bin/bash
export LINK_UP_USERNAME="mail@example.com"
export LINK_UP_PASSWORD="mypassword"
export NIGHTSCOUT_URL="nightscout.yourdomain.com"
export NIGHTSCOUT_API_TOKEN="librelinku-123456789abcde"

npm start
```

Execute the script and check the console output.

## Usage (Docker)
The easiest way to use this is to use the latest docker image:

```
docker run -e LINK_UP_USERNAME="mail@example.com" \
            -e LINK_UP_PASSWORD="mypassword" \
            -e NIGHTSCOUT_URL="nightscout.yourdomain.com" \
            -e NIGHTSCOUT_API_TOKEN="librelinku-123456789abcde" timoschlueter/nightscout-librelink-up
```
