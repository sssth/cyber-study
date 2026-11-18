#!/bin/zsh

# 双击自动打包“赛博书房.app”。
cd "$(dirname "$0")"

if command -v node >/dev/null 2>&1; then
  export PATH="$(dirname "$(command -v node)"):$PATH"
elif [ -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]; then
  export PATH="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
else
  echo "未找到 Node.js。请先安装 Node.js 20 或更高版本。"
  read -r "?按回车键关闭..."
  exit 1
fi

node scripts/package-mac.mjs
STATUS=$?

if [ "$STATUS" -eq 0 ]; then
  latest_app="$(find release/mac/低画质版 -maxdepth 1 -type d -name '赛博书房-*.app' -print | sort | tail -n 1)"
  if [ -n "$latest_app" ]; then
    open "$latest_app"
  fi
fi

read -r "?打包结束，按回车键关闭..."
exit $STATUS
