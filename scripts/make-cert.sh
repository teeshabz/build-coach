#!/bin/sh
# Self-signed cert so iOS Safari treats the page as a secure context
# (no camera or microphone without it). Pinned to whatever address this
# machine is actually reachable on right now.
set -e
cd "$(dirname "$0")/.."
mkdir -p certs

# The interface carrying the default route is the one the phone can reach us on.
# ipconfig getifaddr comes back empty on some interfaces (iPhone tethering, for
# one), so fall back to reading the address off ifconfig directly.
IFACE=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
IP=$(ipconfig getifaddr "$IFACE" 2>/dev/null || true)
[ -z "$IP" ] && IP=$(ifconfig "$IFACE" 2>/dev/null | awk '/inet /{print $2; exit}')
[ -z "$IP" ] && IP=$(ifconfig | awk '/inet /{if($2!="127.0.0.1"){print $2; exit}}')
[ -z "$IP" ] && IP=127.0.0.1

openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout certs/key.pem -out certs/cert.pem \
  -subj "/CN=build-coach" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$IP" 2>/dev/null
echo "cert written for $IP (interface $IFACE)"
