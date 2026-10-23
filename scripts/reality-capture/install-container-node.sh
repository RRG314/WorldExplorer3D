#!/bin/sh
# Container-only amd64 runtime, pinned to the official security release bytes.
# https://nodejs.org/dist/v22.23.4/SHASUMS256.txt
set -eu
test "$(dpkg --print-architecture)" = amd64
we3d_node_work=$(mktemp -d /tmp/we3d-node-security.XXXXXX)
trap 'rm -rf "$we3d_node_work"' EXIT HUP INT TERM
we3d_node_archive=node-v22.23.4-linux-x64.tar.xz
curl --fail --location --proto '=https' --proto-redir '=https' --tlsv1.2 \
  --connect-timeout 20 --max-time 180 --retry 2 \
  "https://nodejs.org/dist/v22.23.4/$we3d_node_archive" -o "$we3d_node_work/$we3d_node_archive"
printf '%s  %s\n' 1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce "$we3d_node_work/$we3d_node_archive" | sha256sum --check --status
tar -xJf "$we3d_node_work/$we3d_node_archive" -C "$we3d_node_work" node-v22.23.4-linux-x64/bin/node
install -m 0755 "$we3d_node_work/node-v22.23.4-linux-x64/bin/node" /usr/local/bin/node
node -e "require('node:assert/strict').equal(process.versions.node, '22.23.4')"
