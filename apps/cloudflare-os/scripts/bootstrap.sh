#!/usr/bin/env bash
# Check out the pinned cloudflare-os-starter + upstream cloudflare-os into a target directory.
# Usage: apps/cloudflare-os/scripts/bootstrap.sh <target-dir>
# Also overlays Yaatal's Gatekeepers (scripts/overlay.sh).
# Afterwards: cd <target-dir>/cloudflare-os && pnpm run-local   (Node >=24.19.0, pnpm 11.17.0)
set -euo pipefail

target="${1:?usage: bootstrap.sh <target-dir>}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pins="$here/upstream.json"

pin() { node -e "const p=require(process.argv[1]); console.log(process.argv[2].split('.').reduce((o,k)=>o[k],p))" "$pins" "$1"; }

starter_repo="$(pin starter.repo)"
starter_commit="$(pin starter.commit)"
upstream_path="$(pin upstream.path)"
upstream_commit="$(pin upstream.commit)"

if [ -e "$target" ]; then
  echo "refusing to overwrite existing $target" >&2
  exit 1
fi

git -c core.longpaths=true clone --quiet "$starter_repo" "$target"
git -C "$target" checkout --quiet "$starter_commit"
git -C "$target" config core.longpaths true
git -C "$target" -c core.longpaths=true submodule update --init --quiet
git -C "$target/$upstream_path" config core.longpaths true
git -C "$target/$upstream_path" fetch --quiet origin "$upstream_commit"
git -C "$target/$upstream_path" checkout --quiet "$upstream_commit"

echo "starter  $(git -C "$target" rev-parse --short HEAD)"
echo "upstream $(git -C "$target/$upstream_path" rev-parse --short HEAD)"
"$here/scripts/overlay.sh" "$target"
