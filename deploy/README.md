# Deploying the docs site to a VPS running Coolify

Serves the built site from a plain folder via host nginx, instead of letting
Coolify build a Docker image.

**The constraint:** Coolify's proxy already binds ports 80 and 443. A second
nginx on those ports will not start. So host nginx listens on **8080** and
Coolify's proxy forwards to it — Coolify keeps handling TLS and certificates.

If you would rather not run host nginx at all, use `website/Dockerfile`
instead and point Coolify at Base Directory `/website`. That path auto-deploys
on every push; this one does not.

---

## 0. Which proxy is Coolify running?

The routing step differs. Check in the Coolify UI under **Server → Proxy**, or:

```bash
docker ps --format '{{.Names}}' | grep -i -E 'traefik|caddy'
```

## 1. DNS

Point the subdomain at the VPS (skip if you have a `*.jugaaadi.com` wildcard):

```
Type: A     Name: scroll-input     Value: <your VPS IP>
```

## 2. Install Node and nginx

```bash
sudo apt update
sudo apt install -y nginx rsync git

# Node 22 — the site needs >= 18
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
```

Remove nginx's default site so nothing tries to hold port 80:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
```

## 3. Clone and build

```bash
sudo git clone https://github.com/MateenKhan/advance-scroll-input.git /opt/advance-scroll-input
cd /opt/advance-scroll-input/website
sudo npm ci
sudo npm run build          # output lands in website/build
```

Publish it:

```bash
sudo mkdir -p /var/www/scroll-input
sudo rsync -a --delete /opt/advance-scroll-input/website/build/ /var/www/scroll-input/
sudo chown -R www-data:www-data /var/www/scroll-input
```

## 4. nginx site on port 8080

```bash
sudo cp /opt/advance-scroll-input/deploy/nginx-scroll-input.conf \
        /etc/nginx/sites-available/scroll-input
sudo ln -s /etc/nginx/sites-available/scroll-input /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Verify locally before involving the proxy:

```bash
curl -I http://127.0.0.1:8080/
# expect: HTTP/1.1 200 OK
```

Keep 8080 off the public internet — Coolify reaches it from inside the host:

```bash
sudo ufw deny 8080
```

## 5. Route the domain through Coolify's proxy

Coolify UI → **Server → Proxy → Dynamic Configurations** → add a new file.

### If Traefik (Coolify default)

File `scroll-input.yaml`:

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

### If Caddy

File `scroll-input.caddy`:

```
scroll-input.jugaaadi.com {
    reverse_proxy host.docker.internal:8080
}
```

Save and let Coolify restart the proxy. TLS is issued automatically once DNS
resolves.

> If `host.docker.internal` doesn't resolve from the proxy container, use the
> Docker bridge gateway instead — usually `172.17.0.1`. Confirm with
> `ip -4 addr show docker0`.

## 6. Redeploying

```bash
sudo bash /opt/advance-scroll-input/deploy/deploy.sh
```

Pulls `main`, rebuilds, syncs to the web root, reloads nginx.

To automate, add a cron entry or a GitHub Action that SSHes in and runs it —
unlike the Dockerfile route, pushes do **not** deploy themselves here.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| nginx won't start | Something else holds the port — `sudo ss -tlnp \| grep :8080` |
| 502 from the proxy | Proxy container can't reach the host; swap `host.docker.internal` for `172.17.0.1` |
| 404 on `/docs/intro` | Web root wrong, or the `try_files ... $uri.html` line is missing |
| Assets 404, page unstyled | `url` in `docusaurus.config.ts` doesn't match the real domain — fix and rebuild |
| No certificate | DNS hasn't propagated, or the domain wasn't entered with `https://` in Coolify |
