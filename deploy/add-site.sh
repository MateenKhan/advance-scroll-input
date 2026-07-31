#!/usr/bin/env bash
#
# Register a new subdomain. Run on the VPS as root:
#
#   bash add-site.sh table.jugaaadi.com
#
# Writes the Traefik router file and creates the web root. Traefik picks the
# file up by watching its dynamic directory — nothing restarts, and no other
# site is affected.
#
# nginx is deliberately not touched: it maps $host to a folder, so it already
# knows how to serve the new subdomain.
set -euo pipefail

DOMAIN="${1:-}"
SITES_ROOT="${SITES_ROOT:-/var/www/sites}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
# Coolify keeps Traefik's dynamic configuration here. Verify with:
#   ls /data/coolify/proxy/dynamic/
DYNAMIC_DIR="${DYNAMIC_DIR:-/data/coolify/proxy/dynamic}"

if [[ -z "$DOMAIN" ]]; then
  echo "usage: bash add-site.sh <domain>" >&2
  exit 1
fi

if [[ ! -d "$DYNAMIC_DIR" ]]; then
  echo "Traefik dynamic directory not found: $DYNAMIC_DIR" >&2
  echo "Find it with: docker inspect coolify-proxy --format '{{json .Mounts}}'" >&2
  exit 1
fi

# Router names must be unique and can't contain dots.
NAME="${DOMAIN//./-}"

echo "==> Creating $SITES_ROOT/$DOMAIN"
mkdir -p "$SITES_ROOT/$DOMAIN"
chown -R "$DEPLOY_USER:www-data" "$SITES_ROOT/$DOMAIN"
chmod -R 775 "$SITES_ROOT/$DOMAIN"

# A placeholder means the domain answers 200 immediately, so you can confirm
# routing and the certificate before the first real deploy.
if [[ ! -f "$SITES_ROOT/$DOMAIN/index.html" ]]; then
  echo "<!doctype html><title>$DOMAIN</title><h1>$DOMAIN</h1><p>Awaiting first deploy.</p>" \
    > "$SITES_ROOT/$DOMAIN/index.html"
  chown "$DEPLOY_USER:www-data" "$SITES_ROOT/$DOMAIN/index.html"
fi

echo "==> Writing Traefik router $DYNAMIC_DIR/$NAME.yaml"
# Field names mirror Coolify's own coolify.yaml on this host: entrypoints are
# `http`/`https`, and the key is lowercase `certresolver`.
#
# The http router is required — it answers the Let's Encrypt HTTP-01
# challenge. Without it no certificate is issued and Cloudflare reports 526.
cat > "$DYNAMIC_DIR/$NAME.yaml" <<EOF
http:
  routers:
    $NAME-http:
      entryPoints:
        - http
      service: host-nginx
      rule: Host(\`$DOMAIN\`)

    $NAME-https:
      entryPoints:
        - https
      service: host-nginx
      rule: Host(\`$DOMAIN\`)
      tls:
        certresolver: letsencrypt
EOF

echo "==> Done — Traefik reloads on its own, nothing restarted."
echo
echo "Verify locally (bypasses Traefik and Cloudflare):"
echo "    curl -H 'Host: $DOMAIN' -I http://127.0.0.1:8081/"
echo
echo "Then, once DNS for $DOMAIN points at this server:"
echo "    curl -I https://$DOMAIN"
