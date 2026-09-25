#!/usr/bin/env bash
# Copy Yaatal's Gatekeepers into a starter checkout's upstream packages, where local dev discovers
# every packages/gatekeeper-* automatically. Safe to re-run after editing them here.
# Usage: apps/cloudflare-os/scripts/overlay.sh <starter-dir>
# Afterwards, in <starter-dir>/cloudflare-os: pnpm install, then per Gatekeeper `pnpm run types:generate`.
set -euo pipefail

target="${1:?usage: overlay.sh <starter-dir>}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
upstream_path="$(node -e "console.log(require(process.argv[1]).upstream.path)" "$here/upstream.json")"
packages="$target/$upstream_path/packages"

[ -d "$packages" ] || { echo "no upstream packages at $packages; run bootstrap.sh first" >&2; exit 1; }

for src in "$here"/gatekeepers/gatekeeper-*/; do
  name="$(basename "$src")"
  dest="$packages/$name"
  mkdir -p "$dest"
  # Tracked sources only: local .dev.vars, generated types, builds and node_modules stay put.
  git -C "$src" ls-files -z --cached --others --exclude-standard . | while IFS= read -r -d '' file; do
    mkdir -p "$dest/$(dirname "$file")"
    cp "$src/$file" "$dest/$file"
  done
  echo "overlay  $name"
done
