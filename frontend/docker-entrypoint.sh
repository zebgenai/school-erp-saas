#!/bin/sh
set -e

node /app/scripts/docker-server.mjs &
exec nginx -g "daemon off;"
