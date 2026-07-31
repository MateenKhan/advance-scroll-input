#!/usr/bin/env bash
#
# One-time VPS bootstrap for hosting many static sites behind Coolify's proxy.
# Idempotent — safe to re-run.
#
# Run on the VPS as root:
#
#   curl -fsSL https://raw.githubusercontent.com/MateenKhan/advance-scroll-input/main/deploy/setup-vps.sh \
#     | bash -s -- "ssh-ed25519 AAAA...your-deploy-public-key... github-actions"
#
# After this, adding a new site needs NO server work: point DNS at this box,
# add the router entry to Coolify, and rsync into /var/www/sites/<domain>/.
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
SITES_ROOT="${SITES_ROOT:-/var/www/sites}"
PUBKEY="${1:-}"
RAW="https://raw.githubusercontent.com/MateenKhan/advance-scroll-input/main/deploy"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (or with sudo)." >&2
  exit 1
fi

echo "==> Installing nginx and rsync"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx rsync curl

echo "==> Creating $DEPLOY_USER user"
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi

if [[ -n "$PUBKEY" ]]; then
  echo "==> Installing deploy public key"
  install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
  touch "/home/$DEPLOY_USER/.ssh/authorized_keys"
  # Don't duplicate the key when this script is re-run.
  grep -qxF "$PUBKEY" "/home/$DEPLOY_USER/.ssh/authorized_keys" \
    || echo "$PUBKEY" >> "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
else
  echo "!! No public key passed — add one to /home/$DEPLOY_USER/.ssh/authorized_keys yourself."
fi

echo "==> Preparing $SITES_ROOT"
mkdir -p "$SITES_ROOT"
# The deploy user writes here; nginx (www-data) reads.
chown -R "$DEPLOY_USER:www-data" "$SITES_ROOT"
chmod -R 775 "$SITES_ROOT"

echo "==> Installing the shared nginx site"
curl -fsSL "$RAW/nginx-sites.conf" -o /etc/nginx/sites-available/sites
ln -sfn /etc/nginx/sites-available/sites /etc/nginx/sites-enabled/sites
# The stock default also claims default_server and would clash.
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx
systemctl enable nginx >/dev/null 2>&1 || true

echo "==> Blocking 8080 from the public internet"
# Coolify's proxy reaches it over the docker bridge, not from outside.
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw deny 8080/tcp >/dev/null || true
fi

cat <<'EOF'

=======================================================================
 Server is ready. nginx serves /var/www/sites/<domain>/ on port 8080.
=======================================================================

Remaining steps, once each:

 1. GitHub org secrets (Settings -> Secrets and variables -> Actions):
      SSH_HOST         this server's IP
      SSH_USER         deploy
      SSH_PRIVATE_KEY  the private half of the key you just installed

 2. In Coolify -> Server -> Proxy -> Dynamic Configurations, add one file
    per domain (this is what gets it an HTTPS certificate):

      http:
        routers:
          scroll-input:
            rule: "Host(`scroll-input.jugaaadi.com`)"
            entryPoints: [https]
            service: host-nginx
            tls: { certResolver: letsencrypt }
        services:
          host-nginx:
            loadBalancer:
              servers: [{ url: "http://host.docker.internal:8080" }]

    Every site reuses the same `host-nginx` service — only the router
    block changes.

 3. Push. The GitHub Action builds and rsyncs into
    /var/www/sites/<domain>/.

Check it locally before involving the proxy:

    curl -H 'Host: scroll-input.jugaaadi.com' -I http://127.0.0.1:8080/

EOF
