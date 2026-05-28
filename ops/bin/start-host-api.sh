#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./strawberry-common.sh
source "${SCRIPT_DIR}/strawberry-common.sh"

INSTALL_ROOT="$(strawberry_install_root "${SCRIPT_DIR}")"
WORKSPACE_ROOT="$(strawberry_workspace_root)"
load_strawberry_env_files "${WORKSPACE_ROOT}/config/strawberry.env" "${WORKSPACE_ROOT}/config/host.env"

cd "${INSTALL_ROOT}"
exec pnpm --filter @strawberry/host start
