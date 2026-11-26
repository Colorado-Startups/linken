#!/bin/sh
# Installs the reviewed trusted helper as root-owned files. Run: sudo ./install.sh. To use a root-owned Node that is
# not first on your PATH, name it: sudo ./install.sh /usr/local/bin/node. Never touches a token.
set -eu
MIN=26
[ "$(id -u)" = 0 ] || { echo "Run with sudo: sudo ./install.sh" >&2; exit 1; }
[ "$(uname)" = Darwin ] || { echo "Linken supports macOS only." >&2; exit 1; }
cd "$(dirname "$0")"
U="${SUDO_USER:-}"; [ -n "$U" ] && [ "$U" != root ] || { echo "Run it with sudo from your own account." >&2; exit 1; }
NODE="${1:-$(su -l "$U" -c 'command -v node' 2>/dev/null | tail -n 1)}"
[ -n "$NODE" ] && [ -x "$NODE" ] || { echo "Node $MIN or newer not found for $U. Install it, then rerun." >&2; exit 1; }
case "$NODE" in /*) ;; *) echo "Give the full path to Node, not $NODE" >&2; exit 1 ;; esac
case "$NODE" in *[!A-Za-z0-9._/+-]*) echo "Unsupported characters in the Node path: $NODE" >&2; exit 1 ;; esac
# The helper runs this Node with the token. If you can write it or its folder (Homebrew in your own account, nvm,
# Volta), any process of yours could swap it and read the token, so refuse (issue #2). Test that before running it:
# this script is root. macOS keeps realpath in /bin (seen on 27.2), other systems in /usr/bin.
RP=/bin/realpath; [ -x "$RP" ] || RP=/usr/bin/realpath
REAL="$("$RP" "$NODE")"
if sudo -u "$U" test -w "$REAL" || sudo -u "$U" test -w "$(dirname "$REAL")"; then
  echo "Your account can write $REAL. Install a root-owned Node from nodejs.org, then name it:" >&2
  echo "  sudo ./install.sh /usr/local/bin/node" >&2; exit 1
fi
V="$("$NODE" -p 'process.versions.node.split(".")[0]')"
[ "$V" -ge "$MIN" ] || { echo "Node $V is older than $MIN. Upgrade it, then rerun." >&2; exit 1; }
install -d -o root -g wheel -m 755 /usr/local/lib/linken /usr/local/bin
install -o root -g wheel -m 644 trusted/linken-linkedin.mjs /usr/local/lib/linken/linken-linkedin.mjs
install -o root -g wheel -m 755 trusted/linken-token /usr/local/bin/linken-token
if [ "$NODE" = /opt/homebrew/bin/node ]; then
  install -o root -g wheel -m 755 trusted/linken-linkedin /usr/local/bin/linken-linkedin
else
  sed "s#/opt/homebrew/bin/node#$NODE#" trusted/linken-linkedin > /usr/local/bin/linken-linkedin
  chown root:wheel /usr/local/bin/linken-linkedin; chmod 755 /usr/local/bin/linken-linkedin
fi
shasum -a 256 /usr/local/lib/linken/linken-linkedin.mjs /usr/local/bin/linken-linkedin /usr/local/bin/linken-token
echo "Installed with Node at $NODE"
