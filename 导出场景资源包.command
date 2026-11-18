#!/bin/zsh

# 只导出两档场景资源，不生成应用。
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

node scripts/package-scenes.mjs
STATUS=$?
if [ "$STATUS" -eq 0 ]; then
  open "场景发布包"
fi
read -r "?场景资源导出结束，按回车键关闭..."
exit $STATUS
