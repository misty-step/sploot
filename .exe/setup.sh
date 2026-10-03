#!/usr/bin/env bash
set -euo pipefail

# Ubuntu 24.04 amd64, on GitHub Actions or the owned workspace; never installs
# credentials and never reads the persistent .sploot-local/library.
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || { echo 'Linux amd64 required' >&2; exit 1; }
. /etc/os-release
[[ "$ID/$VERSION_ID" == ubuntu/24.04 ]] || { echo 'Ubuntu 24.04 required' >&2; exit 1; }
root="${XDG_CACHE_HOME:-$HOME/.cache}/tmp"
mkdir -p "$root" "$HOME/.local/bin" "$HOME/.local/share"
tmp=$(mktemp -d "$root/sploot-setup.XXXXXXXX")
trap 'rm -rf -- "$tmp"' EXIT
fetch() {
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 --retry 3 --output "$3" "$1"
  printf '%s  %s\n' "$2" "$3" | sha256sum --check --strict >/dev/null
}
if ! command -v node >/dev/null || [[ $(node --version) != v22.* ]]; then
  node_dir="$HOME/.local/share/node-22.22.0"
  if [[ ! -x "$node_dir/bin/node" ]]; then
    fetch https://nodejs.org/dist/v22.22.0/node-v22.22.0-linux-x64.tar.gz \
      c33c39ed9c80deddde77c960d00119918b9e352426fd604ba41638d6526a4744 "$tmp/node.tar.gz"
    tar -xzf "$tmp/node.tar.gz" -C "$HOME/.local/share"
    mv "$HOME/.local/share/node-v22.22.0-linux-x64" "$node_dir"
  fi
  export PATH="$node_dir/bin:$PATH"
fi
if ! command -v go >/dev/null || [[ $(go version) != 'go version go1.27.1 linux/amd64' ]]; then
  go_dir="$HOME/.local/share/go-1.27.1"
  if [[ ! -x "$go_dir/bin/go" ]]; then
    fetch https://go.dev/dl/go1.27.1.linux-amd64.tar.gz \
      63d339f0da5ab53635a56f2490a7984dfe12dfcff22ad749f63edaf590168445 "$tmp/go.tar.gz"
    mkdir -p "$tmp/go"
    tar -xzf "$tmp/go.tar.gz" -C "$tmp/go"
    mv "$tmp/go/go" "$go_dir"
  fi
  export PATH="$go_dir/bin:$PATH"
fi
if ! command -v pnpm >/dev/null || [[ $(pnpm --version) != 10.22.0 ]]; then
  corepack enable --install-directory "$HOME/.local/bin"
  export PATH="$HOME/.local/bin:$PATH"
  corepack prepare pnpm@10.22.0 --activate
fi
[[ $(node --version) == v22.* && $(go version) == 'go version go1.27.1 linux/amd64' && $(pnpm --version) == 10.22.0 ]]
if ! sudo -n true 2>/dev/null; then echo 'Noninteractive sudo required for SQLite, FFmpeg and Chromium packages' >&2; exit 1; fi
sudo -n apt-get update
sudo -n apt-get install -y --no-install-recommends libsqlite3-dev ffmpeg xvfb xdotool
pnpm install --frozen-lockfile
pnpm --filter server exec playwright install --with-deps chromium
pnpm --filter server build
pnpm --filter extension build:e2e
pnpm --filter server models:prepare
printf 'Sploot walk toolchain ready: %s, pnpm %s, %s\n' "$(node --version)" "$(pnpm --version)" "$(go version)"
