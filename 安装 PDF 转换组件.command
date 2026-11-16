#!/bin/zsh
set -e
cd "$(dirname "$0")"
python_bin="${CYBER_STUDY_PYTHON:-$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python}"
if [[ ! -x "$python_bin" ]]; then
  python_bin="$(command -v python3)"
fi
target="${1:-.user-data}/pdf-text-deps"
"$python_bin" -m pip install --upgrade --target "$target" -r electron/pdf-requirements.txt
printf '%s\n' "${python_bin:a}" > "$target/.python-path"
