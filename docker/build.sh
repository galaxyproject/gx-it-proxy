#!/bin/bash

# This script demonstrates using the gx-it-proxy to expose internal
# docker endpoints from other containers externally.

# docker build -t gx-it-proxy .

docker network create proxy-test

# Proxy target that is only available in Docker.
docker run -d --net proxy-test --rm -it --name running-it-container strm/helloworld-http

# Externally available NodeJS proxy from Dockerfile.
docker run -d --net proxy-test --rm -it -p 8910:8910 --name proxy-container galaxy/gx-it-proxy:latest

echo "Sleeping for servers to start."
sleep 5

# Make request
echo "Making test request - should return Hello world style HTML"
curl -H 'x-interactive-tool-host: running-it-container' -H 'x-interactive-tool-port: 80' localhost:8910

echo "'IT' logs"
docker logs running-it-container
echo "proxy logs"
docker logs proxy-container

docker container kill $(docker ps -q)
docker network rm proxy-test
