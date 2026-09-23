#!/usr/bin/env bash
# Deploys exactly the committed tree to Vercel production.
# Uses `git archive`, so untracked and ignored files (private notes, .env.local,
# build output) can never be uploaded.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
if [ -n "$(git -C "$root" status --porcelain)" ]; then
  echo "Commit or stash your changes first; only committed files are deployed." >&2
  exit 1
fi
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
git -C "$root" archive HEAD | tar -x -C "$stage"
mkdir -p "$stage/.vercel"
cp "$root/.vercel/project.json" "$stage/.vercel/"
cd "$stage"
vercel deploy --prod --yes --build-env TAKT_COMMIT="$(git -C "$root" rev-parse --short HEAD)"
