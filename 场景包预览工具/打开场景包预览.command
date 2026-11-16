#!/bin/zsh
cd "$(dirname "$0")" || exit 1

node_bin="$(command -v node)"
if [[ -z "$node_bin" ]]; then
  node_bin="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi

if [[ ! -x "$node_bin" ]]; then
  echo '未找到 Node.js。安装 Node.js 后即可打开预览，无需安装项目依赖。'
  read -r '?按回车键关闭…'
  exit 1
fi

"$node_bin" serve.mjs
status=$?
if [[ "$status" -ne 0 ]]; then
  read -r '?按回车键关闭…'
fi
exit "$status"
