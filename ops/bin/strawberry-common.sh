#!/usr/bin/env bash
set -euo pipefail

load_strawberry_env_files() {
  for file in "$@"; do
    if [[ -f "${file}" ]]; then
      set -a
      # shellcheck disable=SC1090
      source "${file}"
      set +a
    fi
  done
}

strawberry_install_root() {
  local script_dir="${1:-}"
  if [[ -n "${STRAWBERRY_INSTALL_ROOT:-}" ]]; then
    echo "${STRAWBERRY_INSTALL_ROOT}"
    return
  fi
  if [[ -n "${script_dir}" ]]; then
    cd "${script_dir}/../.." && pwd
    return
  fi
  echo "/opt/strawberry"
}

strawberry_workspace_root() {
  if [[ -n "${STRAWBERRY_WORKSPACE_ROOT:-}" ]]; then
    echo "${STRAWBERRY_WORKSPACE_ROOT}"
    return
  fi
  if [[ -n "${STRAWBERRY_WORKSPACE:-}" ]]; then
    echo "${STRAWBERRY_WORKSPACE}"
    return
  fi
  echo "${HOME}/.strawberry/workspace"
}
