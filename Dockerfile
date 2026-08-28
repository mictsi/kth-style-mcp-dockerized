# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false
COPY package.json package-lock.json ./
# --ignore-scripts blocks arbitrary lifecycle code from the dependency tree.
RUN npm config set registry https://registry.npmjs.org/ \
    && npm config set replace-registry-host always \
    && npm ci --ignore-scripts

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    NODE_OPTIONS=--disable-proto=throw \
    HOST=0.0.0.0 \
    PORT=8888 \
    BASE_PATH=/
WORKDIR /app

# Application files are owned by root and only readable by the runtime user,
# so a compromised process cannot rewrite its own code.
COPY --from=build --chown=root:root --chmod=444 /app/package.json ./package.json
COPY --from=build --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/dist ./dist

# The landing page and sample site are served under BASE_PATH alongside /mcp.
COPY --chown=root:root --chmod=444 index.html ./index.html
COPY --chown=root:root sample-site ./sample-site

# node:22-alpine ships uid/gid 1000 as "node"; pin numerically so the image
# still runs non-root when the platform ignores the user name.
USER 1000:1000

EXPOSE 8888
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const b=(process.env.BASE_PATH||'').replace(/\/+$/,'');fetch('http://127.0.0.1:'+(process.env.PORT||8888)+b+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/http.js"]
