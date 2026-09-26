#!/usr/bin/env bash
# Copy Yaatal's Gatekeepers into a starter checkout's upstream packages, where local dev discovers
# every packages/gatekeeper-* automatically, then apply patches/*.patch to the upstream checkout.
# Safe to re-run: an already-applied patch is skipped; one that no longer applies stops the script.
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

# Patches: the few upstream strings and defaults the Admin API cannot change (French home copy,
# Yaatal suggestions, a free default model). Each applies cleanly or the script stops, so an
# upstream upgrade that touches the same lines is noticed instead of silently losing the change.
for patch in "$here"/patches/*.patch; do
  [ -e "$patch" ] || continue
  name="$(basename "$patch")"
  if git -C "$target/$upstream_path" apply --reverse --check "$patch" 2>/dev/null; then
    echo "patch    $name (already applied)"
  elif git -C "$target/$upstream_path" apply --check "$patch"; then
    git -C "$target/$upstream_path" apply "$patch"
    echo "patch    $name"
  else
    echo "patch    $name does not apply to this upstream revision; update it" >&2
    exit 1
  fi
done
