# Deploying the docs site

The site is a **static** Docusaurus build — plain HTML, CSS and JS. Nothing
runs server-side, so nothing needs Node in production.

Docusaurus emits directory-based routes (`/docs/intro/index.html`), so any
static server resolves them with default `index.html` handling. No SPA
fallback, no `try_files` rules, no custom nginx config required.

---

## Recommended: Coolify Static build pack

Builds on every commit and serves the output folder with nginx. You keep
deploy-on-push, and production is nginx serving files — no Node runtime, no
heavy application image.

**New Resource → Public Repository** → `https://github.com/MateenKhan/advance-scroll-input`

| Setting | Value |
| --- | --- |
| Branch | `main` |
| Build Pack | **Static** |
| **Base Directory** | `/website` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| **Publish / Output Directory** | `build` |
| Port | `80` |
| Domain | `https://scroll-input.jugaaadi.com` |

Enable the GitHub webhook so pushes to `main` redeploy automatically. Coolify
issues the TLS certificate once DNS resolves — enter the domain **with**
`https://`.

### DNS

Skip if you already have a `*.jugaaadi.com` wildcard:

```
Type: A     Name: scroll-input     Value: <your VPS IP>
```

### Gotchas

- **Base Directory `/website` is the one that bites.** Without it Coolify
  builds from the repo root, finds the library's `package.json`, and produces
  nothing usable.
- **Publish Directory is `build`**, relative to the base directory. Docusaurus
  writes there, not to `dist` or `out`.
- If assets 404 and the page renders unstyled, `url` in
  `website/docusaurus.config.ts` doesn't match the live domain. Fix and redeploy.

---

## Alternative: Dockerfile

`website/Dockerfile` is a two-stage build — Node compiles, nginx serves. Use it
if you want the nginx config version-controlled (caching headers, security
headers) rather than relying on Coolify's defaults.

Same setup as above, but Build Pack **Dockerfile**, Dockerfile Location
`/website/Dockerfile`. Also deploys on commit.

---

## Fallback: host nginx, no containers

Only if you want zero containers. **You lose deploy-on-commit** — pushes do
nothing until you run the script.

Coolify's proxy already binds ports 80 and 443, so a second nginx there will
not start. Host nginx listens on 8080 and Coolify's proxy forwards to it,
keeping TLS with Coolify.

### 1. Install

```bash
sudo apt update && sudo apt install -y nginx rsync git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo rm -f /etc/nginx/sites-enabled/default
```

### 2. Clone, build, publish

```bash
sudo git clone https://github.com/MateenKhan/advance-scroll-input.git /opt/advance-scroll-input
cd /opt/advance-scroll-input/website
sudo npm ci && sudo npm run build

sudo mkdir -p /var/www/scroll-input
sudo rsync -a --delete /opt/advance-scroll-input/website/build/ /var/www/scroll-input/
sudo chown -R www-data:www-data /var/www/scroll-input
```

### 3. nginx site on 8080

```bash
sudo cp /opt/advance-scroll-input/deploy/nginx-scroll-input.conf \
        /etc/nginx/sites-available/scroll-input
sudo ln -s /etc/nginx/sites-available/scroll-input /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

curl -I http://127.0.0.1:8080/     # expect 200 before going further
sudo ufw deny 8080                 # keep it off the public internet
```

### 4. Route through Coolify's proxy

Check which proxy you run:

```bash
docker ps --format '{{.Names}}' | grep -iE 'traefik|caddy'
```

Coolify UI → **Server → Proxy → Dynamic Configurations** → add a file.

**Traefik** (`scroll-input.yaml`):

```yaml
http:
  routers:
    scroll-input:
      rule: "Host(`scroll-input.jugaaadi.com`)"
      entryPoints:
        - https
      service: scroll-input
      tls:
        certResolver: letsencrypt
  services:
    scroll-input:
      loadBalancer:
        servers:
          - url: "http://host.docker.internal:8080"
```

**Caddy** (`scroll-input.caddy`):

```
scroll-input.jugaaadi.com {
    reverse_proxy host.docker.internal:8080
}
```

### 5. Redeploying

```bash
sudo bash /opt/advance-scroll-input/deploy/deploy.sh
```

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Build produces nothing | Base Directory isn't `/website` |
| 404 on every route | Publish Directory isn't `build` |
| Assets 404, page unstyled | `url` in `docusaurus.config.ts` ≠ live domain |
| No certificate | DNS not propagated, or domain entered without `https://` |
| 502 *(host-nginx route)* | Proxy can't reach the host — use `172.17.0.1` instead of `host.docker.internal`; check `ip -4 addr show docker0` |
| nginx won't start *(host-nginx route)* | Port taken — `sudo ss -tlnp \| grep :8080` |
