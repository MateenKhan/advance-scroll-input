# Deploying the docs site

The site is a **static** Docusaurus build — plain HTML, CSS and JS. Nothing
runs server-side, so nothing needs Node in production.

Docusaurus emits directory-based routes (`/docs/intro/index.html`), so any
static server resolves them with default `index.html` handling. No SPA
fallback, no `try_files` rules, no custom nginx config required.

---

## Recommended: GitHub Actions → rsync → host nginx

**No container, and it still deploys on every commit.** GitHub's runners build
the site; only the static output is copied to the VPS. The server needs nginx
and an SSH key — not Node, not Docker, not a CI server.

Workflow: [`.github/workflows/deploy-docs.yml`](../.github/workflows/deploy-docs.yml)

### 1. Create a deploy user and web root on the VPS

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo mkdir -p /var/www/scroll-input
sudo chown -R deploy:www-data /var/www/scroll-input
sudo chmod -R 775 /var/www/scroll-input
```

### 2. Generate a deploy key

Run this **on your own machine**, not the server:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/scroll_input_deploy -C "github-actions-deploy" -N ""
```

Put the **public** half on the VPS:

```bash
sudo -u deploy mkdir -p /home/deploy/.ssh
sudo -u deploy tee -a /home/deploy/.ssh/authorized_keys < ~/.ssh/scroll_input_deploy.pub
sudo -u deploy chmod 700 /home/deploy/.ssh
sudo -u deploy chmod 600 /home/deploy/.ssh/authorized_keys
```

### 3. Add the secrets to GitHub

Repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
| --- | --- |
| `SSH_HOST` | VPS IP or hostname |
| `SSH_USER` | `deploy` |
| `SSH_PRIVATE_KEY` | contents of `~/.ssh/scroll_input_deploy` (the **private** file) |
| `SSH_PORT` | only if not `22` |
| `WEB_ROOT` | only if not `/var/www/scroll-input` |

> The private key never appears in the repo or in logs — GitHub masks secrets.
> Give the `deploy` user nothing beyond write access to the web root.

### 4. Install nginx and the site config

```bash
sudo apt update && sudo apt install -y nginx rsync
sudo rm -f /etc/nginx/sites-enabled/default

sudo curl -o /etc/nginx/sites-available/scroll-input \
  https://raw.githubusercontent.com/MateenKhan/advance-scroll-input/main/deploy/nginx-scroll-input.conf
sudo ln -s /etc/nginx/sites-available/scroll-input /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

nginx listens on **8081** — Coolify's proxy owns 80/443, so a second nginx
there will not start.

### 5. Route the domain through Coolify's proxy

See [step 4 of the fallback section](#4-route-through-coolifys-proxy) below —
same dynamic configuration, pointing at port 8081.

### 6. Deploy

Push to `main`, or run the workflow by hand from the **Actions** tab. Check
progress there; the build takes ~1–2 minutes.

---

## Alternative: Coolify Static build pack

**This produces a container.** Coolify is Docker end to end — every resource it
manages is a container — so the Static pack builds an `nginx:alpine` image
(~50 MB) holding your files. There is no Node runtime and no app server, which
makes it the lightest thing Coolify can run, but it is still Docker.

Use it if you would rather not manage nginx or SSH keys yourself.

Builds on every commit and serves the output folder with nginx. You keep
deploy-on-push, and production is nginx serving files — no Node runtime, no
heavy application image.

### Where to click (Coolify v4)

Resources live inside projects, so there is no top-level "New Resource"
button. From **Projects**:

1. **`+ Add`** next to the *Projects* heading to create one (name it
   `scroll-input`) — or **`+ Add Resource`** on an existing project card.
2. Choose the environment, usually **production**.
3. Resource type → **Public Repository**.
4. Repository URL → `https://github.com/MateenKhan/advance-scroll-input`
5. The build settings appear. Fill in the table below.

> **Build Pack often defaults to Nixpacks.** Switch it to **Static**
> explicitly, or Coolify auto-detects a Node app and tries to run a server
> instead of serving the built files.

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

## Fallback: build on the VPS by hand

Same server setup as the GitHub Actions route, but you build on the box and
run the deploy yourself. **No auto-deploy** — pushes do nothing until you run
the script. Useful if the VPS has no outbound access to GitHub Actions, or you
want to deploy without pushing.

Coolify's proxy already binds ports 80 and 443, so a second nginx there will
not start. Host nginx listens on 8081 and Coolify's proxy forwards to it,
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

### 3. nginx site on 8081

```bash
sudo cp /opt/advance-scroll-input/deploy/nginx-scroll-input.conf \
        /etc/nginx/sites-available/scroll-input
sudo ln -s /etc/nginx/sites-available/scroll-input /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

curl -I http://127.0.0.1:8081/     # expect 200 before going further
sudo ufw deny 8081                 # keep it off the public internet
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
          - url: "http://host.docker.internal:8081"
```

**Caddy** (`scroll-input.caddy`):

```
scroll-input.jugaaadi.com {
    reverse_proxy host.docker.internal:8081
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
| nginx won't start *(host-nginx route)* | Port taken — `sudo ss -tlnp \| grep :8081` |
