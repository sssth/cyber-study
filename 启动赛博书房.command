#!/bin/zsh

# 双击启动赛博书房 Demo。
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

if command -v pnpm >/dev/null 2>&1; then
  PNPM_BIN="$(command -v pnpm)"
elif [ -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm" ]; then
  PNPM_BIN="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm"
else
  echo "未找到 pnpm。请先运行：npm install -g pnpm"
  read -r "?按回车键关闭..."
  exit 1
fi

"$PNPM_BIN" dev
