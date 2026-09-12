#!/bin/sh
# Self-signed cert so iOS Safari treats the page as a secure context
# (no camera or microphone without it).
set -e
cd "$(dirname "$0")/.."
mkdir -p certs
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout certs/key.pem -out certs/cert.pem \
  -subj "/CN=build-coach" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$IP" 2>/dev/null
echo "cert written for IP $IP -> https://$IP:8443"
