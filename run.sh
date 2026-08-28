#!/usr/bin/env bash
#
# Lifecycle helper for the dockerized kth-style-mcp server.
#
#   ./run.sh run [--build]   start the container (detached)
#   ./run.sh stop            stop the container, keep it around
#   ./run.sh restart         stop then run
#   ./run.sh clean [--all]   stop and remove container, volumes and image
#   ./run.sh logs [-f]       show container logs
#   ./run.sh status          show container state and health
#   ./run.sh shell           open a shell in the running container
#
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

SERVICE="kth-style-mcp"
IMAGE="kth-style-mcp:local"

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "error: neither 'docker compose' nor 'docker-compose' is available" >&2
  exit 1
fi

# Load .env so the endpoint we print matches the container configuration.
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BASE_PATH="${BASE_PATH:-/}"
HOST_PORT="${HOST_PORT:-8888}"
BIND_ADDRESS="${BIND_ADDRESS:-127.0.0.1}"

endpoint() {
  local prefix="${BASE_PATH%/}"
  echo "http://${BIND_ADDRESS}:${HOST_PORT}${prefix}/mcp"
}

cmd_run() {
  local build_args=()
  [[ "${1:-}" == "--build" ]] && build_args=(--build)
  "${COMPOSE[@]}" up -d "${build_args[@]}"
  echo "MCP endpoint: $(endpoint)"
  echo "Health:       $(endpoint | sed 's#/mcp$#/healthz#')"
}

cmd_stop() {
  "${COMPOSE[@]}" stop
}

cmd_restart() {
  cmd_stop
  cmd_run "$@"
}

cmd_clean() {
  # Removes containers, networks and named volumes for this project.
  "${COMPOSE[@]}" down --volumes --remove-orphans
  if [[ "${1:-}" == "--all" ]]; then
    docker image rm -f "$IMAGE" >/dev/null 2>&1 || true
    docker builder prune --force --filter until=0h >/dev/null 2>&1 || true
    echo "removed image $IMAGE and dangling build cache"
  fi
}

cmd_logs() {
  if [[ "${1:-}" == "-f" || "${1:-}" == "--follow" ]]; then
    "${COMPOSE[@]}" logs --follow --tail=200 "$SERVICE"
  else
    "${COMPOSE[@]}" logs --tail="${1:-200}" "$SERVICE"
  fi
}

cmd_status() {
  "${COMPOSE[@]}" ps
  docker inspect --format '{{.Name}} state={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' \
    "$SERVICE" 2>/dev/null || true
}

cmd_shell() {
  "${COMPOSE[@]}" exec "$SERVICE" /bin/sh
}

usage() {
  sed -n '3,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

case "${1:-}" in
  run|up|start) shift; cmd_run "$@" ;;
  stop|down)    shift; cmd_stop "$@" ;;
  restart)      shift; cmd_restart "$@" ;;
  clean)        shift; cmd_clean "$@" ;;
  logs)         shift; cmd_logs "$@" ;;
  status|ps)    shift; cmd_status "$@" ;;
  shell|sh)     shift; cmd_shell "$@" ;;
  ""|-h|--help|help) usage ;;
  *) echo "error: unknown command '$1'" >&2; usage >&2; exit 2 ;;
esac
