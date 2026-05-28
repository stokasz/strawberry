#!/usr/bin/env bash
# Installed to ~/.local/bin/strawberry by install.sh (INSTALL_ROOT substituted at install time).
set -euo pipefail

export STRAWBERRY_INSTALL_ROOT="@INSTALL_ROOT@"

resolve_node() {
  local candidate=""
  local candidates=()

  if [[ -n "${HOMEBREW_PREFIX:-}" && -x "${HOMEBREW_PREFIX}/bin/node" ]]; then
    candidates+=("${HOMEBREW_PREFIX}/bin/node")
  fi
  if [[ -x /opt/homebrew/bin/node ]]; then
    candidates+=("/opt/homebrew/bin/node")
  fi
  if command -v brew >/dev/null 2>&1; then
    candidate="$(brew --prefix node 2>/dev/null)/bin/node"
    if [[ -x "${candidate}" ]]; then
      candidates+=("${candidate}")
    fi
  fi
  if [[ -x /usr/local/bin/node ]]; then
    candidates+=("/usr/local/bin/node")
  fi
  if command -v node >/dev/null 2>&1; then
    candidates+=("$(command -v node)")
  fi

  for candidate in "${candidates[@]}"; do
    if [[ -x "${candidate}" ]] && "${candidate}" -e 'process.exit(0)' >/dev/null 2>&1; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  printf 'install.sh: no working Node.js found (try: brew reinstall node)\n' >&2
  return 1
}

NODE="$(resolve_node)"
exec "${NODE}" --experimental-strip-types "${STRAWBERRY_INSTALL_ROOT}/packages/cli/src/cli.ts" "$@"
