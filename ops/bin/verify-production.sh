#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

for script in "${REPO_ROOT}"/ops/bin/*.sh; do
  bash -n "${script}"
done

if rg -n 'constructor\([^)]*\b(private|protected|public)\b|constructor\([^)]*,\s*readonly\b' \
  "${REPO_ROOT}/packages/agent/src" \
  "${REPO_ROOT}/packages/host/src" \
  "${REPO_ROOT}/packages/telegram/src" >/dev/null; then
  echo "constructor parameter properties break node --experimental-strip-types" >&2
  rg -n 'constructor\([^)]*\b(private|protected|public)\b|constructor\([^)]*,\s*readonly\b' \
    "${REPO_ROOT}/packages/agent/src" \
    "${REPO_ROOT}/packages/host/src" \
    "${REPO_ROOT}/packages/telegram/src"
  exit 1
fi

echo "ops script syntax ok"
