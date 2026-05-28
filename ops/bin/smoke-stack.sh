#!/usr/bin/env bash
set -euo pipefail

if [[ "${STRAWBERRY_RUN_STACK_SMOKE:-}" != "1" ]]; then
  echo "Set STRAWBERRY_RUN_STACK_SMOKE=1 to run the macOS stack smoke test." >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=strawberry-common.sh
source "${script_dir}/strawberry-common.sh"

install_root="$(strawberry_install_root "${script_dir}")"
cd "${install_root}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "stack smoke skipped: Apple Container stack requires macOS"
  exit 0
fi

if ! command -v container >/dev/null 2>&1; then
  echo "stack smoke skipped: Apple Container CLI is not installed"
  exit 0
fi

echo "checking Strawberry stack readiness..."
pnpm --filter @strawberry/cli start -- doctor

echo "preparing host/container runtime..."
pnpm --filter @strawberry/cli start -- prepare

echo "stack smoke prepare completed"
