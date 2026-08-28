# Dockerized kth-style-mcp

Builds the TypeScript MCP server into a hardened, self-contained image and serves it over MCP Streamable HTTP.

## Quick start

```bash
cp .env.example .env      # optional; edit BASE_PATH / PUBLIC_URL
./run.sh run --build
```

## run.sh

| Command | Effect |
| --- | --- |
| `./run.sh run [--build]` | Start detached, print the resolved endpoints |
| `./run.sh stop` | Stop the container, keep it |
| `./run.sh restart [--build]` | Stop then run |
| `./run.sh clean [--all]` | Remove container, network and volumes; `--all` also drops the image and dangling build cache |
| `./run.sh logs [-f\|N]` | Tail logs (`-f` follows, `N` sets the tail length) |
| `./run.sh status` | Compose state plus health status |
| `./run.sh shell` | Shell inside the running container |

`run.sh` sources `.env`, so the endpoints it prints match the running configuration.

## Publishing under a URL path

Everything the app serves lives under one prefix — no route is exposed at the root when a prefix is set.

Two ways to set it:

- `PUBLIC_URL` — the full URL the app is published under, e.g. `https://example.kth.se/kth-style-mcp`. Its path becomes the mount point and its hostname is added to the DNS-rebinding allowlist.
- `BASE_PATH` — path prefix only, e.g. `/kth-style-mcp`. Overrides the `PUBLIC_URL` path when both are set. `/` serves at the root.

With `BASE_PATH=/kth-style-mcp`:

```text
POST /kth-style-mcp/mcp        MCP Streamable HTTP endpoint
GET  /kth-style-mcp/healthz    health probe
everything else                404
```

The health payload echoes the resolved routing:

```bash
curl http://127.0.0.1:8888/kth-style-mcp/healthz
{"status":"ok","service":"kth-style-mcp","transport":"streamable-http",
 "basePath":"/kth-style-mcp","mcpPath":"/kth-style-mcp/mcp",
 "publicUrl":"https://example.kth.se/kth-style-mcp/mcp"}
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PUBLIC_URL` | – | Full published URL; sets the mount path and an allowed Host |
| `BASE_PATH` | `/` | Path prefix; overrides the `PUBLIC_URL` path |
| `ALLOWED_HOSTS` | – | Extra Host header hostnames, comma separated |
| `TRUST_PROXY` | `0` | Reverse-proxy hops Express should trust |
| `HOST` / `PORT` | `0.0.0.0` / `8888` | In-container bind address |
| `BIND_ADDRESS` / `HOST_PORT` | `127.0.0.1` / `8888` | Host side of the published port |

Host header validation is active whenever `PUBLIC_URL` or `ALLOWED_HOSTS` is set; loopback names stay allowed so the container health check keeps working. Without either, no validation is applied and the SDK logs a warning — set one when the port is reachable beyond loopback.

## Hardening

Image:

- multi-stage build; the runtime stage carries `dist`, pruned production `node_modules` and `package.json` only
- `npm ci --ignore-scripts` — no dependency lifecycle scripts run at build time
- runs as `1000:1000`, never root; application files are root-owned and not writable by the runtime user
- `NODE_ENV=production`, `NODE_OPTIONS=--disable-proto=throw`
- health check follows `BASE_PATH`

Runtime (compose):

- `read_only: true` root filesystem with a `noexec,nosuid,nodev` tmpfs for `/tmp`
- `cap_drop: ALL`, `no-new-privileges:true`
- `init: true` for correct signal handling and reaping
- limits: `pids_limit 256`, `mem_limit 512m`, `cpus 1.0`, `nofile 1024/2048`
- port bound to `127.0.0.1` by default — publish through a reverse proxy
- log rotation at 3 × 10 MB

Application:

- security headers on every response (`nosniff`, `DENY`, `no-referrer`, CSP `default-src 'none'`, `no-store`)
- `x-powered-by` disabled
- header/request/keep-alive timeouts bound against slow clients
- 100 KB JSON body cap (Express default)
- graceful shutdown on SIGTERM/SIGINT with a 10 s forced-close fallback

## stdio entrypoint

Unchanged:

```bash
npm run build
npm start
```

## Licensing

The image redistributes the production dependency tree under `/app/node_modules`, each package
keeping its own license file. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for full
attribution, and [Known licensing gaps](README.md#known-licensing-gaps) — notably that
`@kth/style` publishes no license — before distributing the image.

## Credits

MCP server created by [jrolofsson](https://github.com/jrolofsson). This document covers the container packaging only — see [README.md](README.md) for the server itself.
