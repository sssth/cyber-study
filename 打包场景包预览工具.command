#!/bin/zsh
cd "$(dirname "$0")" || exit 1

node_bin="$(command -v node)"
if [[ -z "$node_bin" ]]; then
  node_bin="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi

if [[ ! -x "$node_bin" ]]; then
  echo '未找到 Node.js。请先安装 Node.js 20 或更高版本。'
  read -r '?按回车键关闭…'
  exit 1
fi

"$node_bin" scripts/package-mac.mjs --preview
status=$?
read -r '?打包结束，按回车键关闭…'
exit "$status"
