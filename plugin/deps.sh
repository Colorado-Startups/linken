#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# SessionStart hook for the Claude Code plugin. A plugin install is a git checkout with no node_modules, so this puts
# the server's two production dependencies in the plugin's data folder, which survives plugin updates. It runs
# `npm ci` only when the lockfile changed, with install scripts off. It never touches a token or the trusted helper.
# Usage: deps.sh <plugin root> <plugin data folder>
set -u
root=$1
data=$2
# The marker is written only after npm ci succeeds, so a killed or failed install runs again next session.
marker=$data/.linken-installed-lock
if cmp -s "$root/package-lock.json" "$marker" && [ -d "$data/node_modules" ]; then exit 0; fi
mkdir -p "$data" && cp "$root/package.json" "$root/package-lock.json" "$data/" || exit 0
rm -f "$marker"
if (cd "$data" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null 2>&1); then
  cp "$root/package-lock.json" "$marker"
else
  echo "Linken could not install its dependencies with npm ci. Check that npm is on your PATH, then start a new session." >&2
fi
exit 0
