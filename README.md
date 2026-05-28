# Strawberry

Multiplayer AI agent in your Telegram group chat.

Strawberry is local-first, self-custodial agent infrastructure. Telegram and the trusted host API run on your Mac. The Pi agent runs in an isolated Apple Container. Private keys, RPC URLs, and signing stay on the host.

## Topology

```text
Telegram (host) -> Agent (container) -> Host API (host) -> chain RPC / signer
```

- **Telegram**: routing, passive group context, `/new`
- **Agent**: Pi runtime and your skills inside the container
- **Host**: chain reads, transaction prepare/execute, secrets

Production requires **macOS 26+** on Apple Silicon with [Apple Container](https://github.com/apple/container). There is no host-direct agent fallback in production mode.

## Quick Start

Install (macOS 26+, Apple Silicon):

```bash
curl -fsSL https://raw.githubusercontent.com/stokasz/strawberry/main/install.sh | bash
strawberry
```

The installer clones to `~/.strawberry/install`, installs Homebrew packages (`node`, `pnpm`, `container`), runs `pnpm install`, and places `strawberry` in `~/.local/bin`. The first `strawberry` run walks you through setup; later runs start the stack. Config and secrets live in `~/.strawberry/workspace` by default.

Development from a source checkout:

```bash
brew install container
pnpm install
container system start
pnpm strawberry onboard
pnpm strawberry
```

Add multiplayer AI to your group chat and have fun with crypto again.

Use `STRAWBERRY_WORKSPACE_ROOT=/path/to/workspace strawberry` to keep config, apps, state, and logs in a custom workspace.

See [ops/MACOS.md](ops/MACOS.md) for prerequisites and troubleshooting.

`strawberry onboard` runs Pi's native `/login` flow into `.strawberry/auth.json`, then collects your Telegram bot token and optional chain settings (all host-only secrets). You do not need your numeric Telegram user ID for group chat; it is only for optional admin DMs. Add the bot to your group after `strawberry`.

Pair the group with the local `/pair` code printed by onboard, then talk by @mentioning the bot or replying to her after the bot sends the Connected message. Press Ctrl+C to stop.

Other commands: `strawberry login`, `strawberry doctor`, `strawberry status`, `strawberry logs`, `strawberry stop`.

## Config

Production env files live in `config/`:

- `strawberry.env` — paths, container settings
- `host.env` — bind address, optional RPC URL, optional signer command
- `telegram.env` — bot token, remote agent URL, agent bearer token
- `agent.env` — sandbox bind settings and `STRAWBERRY_HOST_BASE_URL`

`agent.env` is mounted into the Apple Container. Rebuild the image after changing dependencies in the Dockerfile.

## Packages

- `@strawberry/cli`: install, onboard, start/stop
- `@strawberry/telegram`: Telegram polling gateway
- `@strawberry/agent`: isolated Pi HTTP runtime
- `@strawberry/host`: trusted host API

## Agent Workspace

- `apps/`: your handcrafted apps (Solidity, tests, etc.)
- `.strawberry/skills/`: your handcrafted skills
- `.strawberry/AGENTS.md`: your constitution

These directories are mounted into the agent container and persist across restarts.

## Guest Request CLIs

Skills should call fixed guest commands, not raw HTTP.

```bash
pnpm --filter @strawberry/agent chain:block -- \
  --chat-id '<chat_id>' \
  --telegram-user-id '<telegram_user_id>' \
  --block 'latest'
```

Add new actions by copying `chain-block-request.ts` and adding a typed host route in your handcrafted host server.

## Security Model

- Telegram bot token stays on the host.
- RPC URL, signer command, and private keys stay on the host. RPC is only needed when you use chain reads.
- The container agent calls the host API only; it does not receive RPC URL or signer secrets.
- Telegram reaches the agent over localhost with a bearer token.
- Guest→host auth uses `STRAWBERRY_HOST_API_KEY` bearer token.

## Development

```bash
pnpm test
pnpm typecheck
pnpm verify
```

`pnpm verify` runs in-process tests, TypeScript checks, and ops script syntax checks. Full production validation still requires a macOS Apple Container smoke run with `strawberry`.
