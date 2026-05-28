#!/usr/bin/env bash
# Strawberry native installer (macOS Apple Silicon).
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/stokasz/strawberry/main/install.sh | bash
#
# Environment (optional):
#   STRAWBERRY_REPO=stokasz/strawberry
#   STRAWBERRY_REF=main
#   STRAWBERRY_INSTALL_ROOT=~/.strawberry/install
#   STRAWBERRY_BIN_DIR=~/.local/bin
#   STRAWBERRY_INSTALL_DRY_RUN=1

set -euo pipefail

STRAWBERRY_REPO="${STRAWBERRY_REPO:-stokasz/strawberry}"
STRAWBERRY_REF="${STRAWBERRY_REF:-main}"
STRAWBERRY_INSTALL_ROOT="${STRAWBERRY_INSTALL_ROOT:-${HOME}/.strawberry/install}"
STRAWBERRY_BIN_DIR="${STRAWBERRY_BIN_DIR:-${HOME}/.local/bin}"
STRAWBERRY_INSTALL_DRY_RUN="${STRAWBERRY_INSTALL_DRY_RUN:-0}"

log() {
  printf '==> %s\n' "$*" >&2
}

die() {
  printf 'install.sh: %s\n' "$*" >&2
  exit 1
}

run() {
  if [[ "${STRAWBERRY_INSTALL_DRY_RUN}" == "1" ]]; then
    printf '[dry-run]' >&2
    printf ' %q' "$@" >&2
    printf '\n' >&2
    return 0
  fi
  "$@"
}

require_macos_arm64() {
  [[ "$(uname -s)" == "Darwin" ]] || die "Strawberry requires macOS."
  [[ "$(uname -m)" == "arm64" ]] || die "Strawberry requires Apple Silicon (arm64)."
}

ensure_path_dir() {
  run mkdir -p "${STRAWBERRY_BIN_DIR}"
}

brew_shellenv() {
  if [[ -x /opt/homebrew/bin/brew ]]; then
    # shellcheck disable=SC1091
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    # shellcheck disable=SC1091
    eval "$(/usr/local/bin/brew shellenv)"
  fi
}

ensure_homebrew() {
  brew_shellenv
  if command -v brew >/dev/null 2>&1; then
    return 0
  fi
  log "Installing Homebrew (you may be prompted for your password)…"
  run /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  brew_shellenv
  command -v brew >/dev/null 2>&1 || die "Homebrew is not on PATH. Open a new terminal or run: eval \"\$(/opt/homebrew/bin/brew shellenv)\""
}

ensure_brew_formula() {
  local formula="$1"
  local label="$2"
  if brew list --formula "${formula}" >/dev/null 2>&1; then
    return 0
  fi
  log "Installing ${label}…"
  run brew install "${formula}"
}

ensure_git() {
  command -v git >/dev/null 2>&1 || die "git is required."
}

install_or_update_source() {
  local repo_url="https://github.com/${STRAWBERRY_REPO}.git"
  if [[ -d "${STRAWBERRY_INSTALL_ROOT}/.git" ]]; then
    log "Updating Strawberry at ${STRAWBERRY_INSTALL_ROOT}…"
    run git -C "${STRAWBERRY_INSTALL_ROOT}" fetch --depth 1 origin "${STRAWBERRY_REF}"
    run git -C "${STRAWBERRY_INSTALL_ROOT}" checkout "${STRAWBERRY_REF}"
    run git -C "${STRAWBERRY_INSTALL_ROOT}" reset --hard "origin/${STRAWBERRY_REF}"
    return 0
  fi
  if [[ -e "${STRAWBERRY_INSTALL_ROOT}" ]]; then
    die "${STRAWBERRY_INSTALL_ROOT} exists but is not a git checkout. Remove it or set STRAWBERRY_INSTALL_ROOT."
  fi
  log "Cloning ${STRAWBERRY_REPO} (${STRAWBERRY_REF})…"
  run mkdir -p "$(dirname "${STRAWBERRY_INSTALL_ROOT}")"
  run git clone --depth 1 --branch "${STRAWBERRY_REF}" "${repo_url}" "${STRAWBERRY_INSTALL_ROOT}"
}

install_dependencies() {
  ensure_homebrew
  ensure_brew_formula node Node.js
  # Prefer the current `node` formula over a stale linked node@22 on PATH.
  brew unlink node@22 >/dev/null 2>&1 || true
  hash -r 2>/dev/null || true
  ensure_brew_formula pnpm pnpm
  ensure_brew_formula container Apple\ Container
  if command -v corepack >/dev/null 2>&1; then
    run corepack enable || true
    run corepack prepare pnpm@11.4.0 --activate || true
  fi
  log "Installing Strawberry package dependencies…"
  run bash -c "cd \"${STRAWBERRY_INSTALL_ROOT}\" && pnpm install --frozen-lockfile"
}

write_wrapper() {
  local wrapper="${STRAWBERRY_BIN_DIR}/strawberry"
  local template="${STRAWBERRY_INSTALL_ROOT}/ops/bin/strawberry-cli.sh"
  log "Installing CLI wrapper to ${wrapper}…"
  if [[ "${STRAWBERRY_INSTALL_DRY_RUN}" == "1" ]]; then
    return 0
  fi
  [[ -f "${template}" ]] || die "missing ${template}"
  sed "s|@INSTALL_ROOT@|${STRAWBERRY_INSTALL_ROOT}|g" "${template}" >"${wrapper}"
  chmod 0755 "${wrapper}"
}

print_path_hint() {
  case ":${PATH}:" in
    *":${STRAWBERRY_BIN_DIR}:"*) return 0 ;;
  esac
  log "Add ${STRAWBERRY_BIN_DIR} to your PATH, for example:"
  printf '    echo '\''export PATH="%s:$PATH"'\'' >> ~/.zprofile\n' "${STRAWBERRY_BIN_DIR}" >&2
}

main() {
  require_macos_arm64
  ensure_git
  ensure_path_dir
  install_or_update_source
  install_dependencies
  write_wrapper
  print_path_hint
  log "Installed Strawberry."
  log "Next: strawberry"
  log "Install root: ${STRAWBERRY_INSTALL_ROOT}"
  log "Default workspace: \${HOME}/.strawberry/workspace"
}

main "$@"
