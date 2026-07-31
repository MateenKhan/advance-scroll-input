#!/usr/bin/env bash
#
# Build the docs site on the VPS and publish it to the nginx web root.
# Re-run this any time you want to deploy; it is idempotent.
#
#   sudo bash /opt/advance-scroll-input/deploy/deploy.sh
#
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/advance-scroll-input}"
WEB_ROOT="${WEB_ROOT:-/var/www/scroll-input}"
BRANCH="${BRANCH:-main}"

echo "==> Updating $REPO_DIR ($BRANCH)"
git -C "$REPO_DIR" fetch --depth 1 origin "$BRANCH"
git -C "$REPO_DIR" reset --hard "origin/$BRANCH"

echo "==> Installing website dependencies"
cd "$REPO_DIR/website"
npm ci

echo "==> Building static site"
npm run build

echo "==> Publishing to $WEB_ROOT"
mkdir -p "$WEB_ROOT"
# --delete removes files dropped between builds; the trailing slash on the
# source is required or rsync nests a build/ directory inside the web root.
rsync -a --delete "$REPO_DIR/website/build/" "$WEB_ROOT/"

# nginx runs as www-data on Debian/Ubuntu.
chown -R www-data:www-data "$WEB_ROOT"

echo "==> Reloading nginx"
nginx -t
systemctl reload nginx

echo "==> Done: https://scroll-input.jugaaadi.com"
