#!/usr/bin/env bash
# Copy Yaatal's Gatekeepers into a starter checkout's upstream packages, where local dev discovers
# every packages/gatekeeper-* automatically; replace the starter's own Custom Gatekeeper with Yaatal's
# control board; then apply patches/*.patch to the upstream checkout.
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

# The Custom Gatekeeper is not a gatekeepers/gatekeeper-* directory, so the loop above misses it. It
# lives in the starter's own packages/ rather than the upstream submodule's, because that is where
# the starter's deploy script looks for it (scripts/deploy.ts maps
# customGatekeeper -> "packages/custom-gatekeeper"). One binding, GATEKEEPER_CUSTOM, is already wired
# to it in deployment.jsonc, so replacing the package does not change any binding.
#
# Same merge as above, never a wipe: a file upstream ships that this package does not (currently only
# worker-configuration.d.ts, which is generated and deliberately not carried) is left in place.
custom_src="$here/custom-gatekeeper"
custom_dest="$target/packages/custom-gatekeeper"
if [ -d "$custom_src" ] && [ -d "$target/packages" ]; then
  mkdir -p "$custom_dest"
  git -C "$custom_src" ls-files -z --cached --others --exclude-standard . | while IFS= read -r -d '' file; do
    mkdir -p "$custom_dest/$(dirname "$file")"
    cp "$custom_src/$file" "$custom_dest/$file"
  done
  echo "overlay  custom-gatekeeper"
fi

# Patches: the few upstream strings and defaults the Admin API cannot change (French home copy,
# Yaatal suggestions, a free default model). Each applies cleanly or the script stops, so an
# upstream upgrade that touches the same lines is noticed instead of silently losing the change.
# Starter patches (deploy tooling) apply to the starter checkout itself.
#
# 0003 touches packages/custom-gatekeeper/src/custom.ts, which the copy above has just replaced. The
# replacement already contains the method that patch inserts, so its reverse check succeeds and it
# reports "already applied" and is skipped. That is the intended outcome, not a lost patch: the copy
# is the later and more complete version of the same file. If the copy ever stops carrying that
# method, the reverse check starts failing, the forward check takes over, and the insertion is
# re-applied -- so the two paths cannot silently disagree.
for patch in "$here"/patches/starter/*.patch; do
  [ -e "$patch" ] || continue
  name="starter/$(basename "$patch")"
  if git -C "$target" apply --reverse --check "$patch" 2>/dev/null; then
    echo "patch    $name (already applied)"
  elif git -C "$target" apply --check "$patch"; then
    git -C "$target" apply "$patch"
    echo "patch    $name"
  else
    echo "patch    $name does not apply to this starter revision; update it" >&2
    exit 1
  fi
done
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
