# Strawberry

🍓 **StrawberryAI** is local-first, non-custodial, crypto ai agent for group chats on Telegram.

Run the agent on your Mac. Talk to it in Telegram with your group. Your keys stay at home. The good stuff still gets passed around.

```
      {\__/}              {\__/}
      ( o_o)              (o_o )  share?
      / > 🍓              \ <

      {\__/}              {\__/}
      ( o_o)              ( o_o)
      / > 🍓  ---->       \ <

      {\__/}              {\__/}
      ( ^_^)              (^_^ )
      /                   🍓 < \
```

Ask, pass, receive.

One bunny lives on your machine: the stack, the keys, the agent. One bunny lives in the chat: your people, arms out, waiting for someone to say *share?*

The strawberry isn't custody. It's whatever came back worth sharing: a read, a tx explained plain, a reply the whole group can use. It hops block to block. You stay in control.

More on the bunnies in [DESIGN.md](DESIGN.md).

## How it works

```text
Telegram (host) -> Agent (container) -> Host API (host) -> chain RPC / signer
```

- **Telegram**: routing, passive group context, `/new`
- **Agent**: Pi runtime and your skills inside the container
- **Host**: chain reads, transaction prepare/execute, secrets

Production requires **macOS 26+** on Apple Silicon with [Apple Container](https://github.com/apple/container). There is no host-direct agent fallback in production mode.

Private keys, RPC URLs, and signing stay on the host. Telegram and the trusted host API run on your Mac. The Pi agent runs in an isolated Apple Container.

## Quick start

Install (macOS 26+, Apple Silicon):

```bash
curl -fsSL https://raw.githubusercontent.com/stokasz/strawberry/main/install.sh | bash
strawberry
```

The installer clones to `~/.strawberry/install`, installs Homebrew packages (`node`, `pnpm`, `container`), runs `pnpm install`, and places `strawberry` in `~/.local/bin`. The first `strawberry` run walks you through setup; later runs start the stack. Config and secrets live in `~/.strawberry/workspace` by default, regardless of the directory you launch from.

Use `STRAWBERRY_WORKSPACE_ROOT=/path/to/workspace strawberry` to keep config, apps, state, and logs in a custom workspace.

See [ops/MACOS.md](ops/MACOS.md) for prerequisites and troubleshooting.

`strawberry onboard` runs Pi's native `/login` flow into `.strawberry/auth.json`, then collects your Telegram bot token and optional chain settings (all host-only secrets). You do not need your numeric Telegram user ID for group chat; it is only for optional admin DMs. In @BotFather, disable Group Privacy for the bot or make the bot a group admin, then add it to your group after `strawberry`.

Pair the group with the local `/pair` code printed by onboard, then talk by @mentioning the bot or replying to her after the bot sends the Connected message. Press Ctrl+C to stop.

Other commands: `strawberry login`, `strawberry doctor`, `strawberry status`, `strawberry logs`, `strawberry stop`.

## Config

Production env files live in `config/`:

- `strawberry.env`: paths, container settings
- `host.env`: bind address, optional RPC URL, optional signer command
- `telegram.env`: bot token, remote agent URL, agent bearer token
- `agent.env`: sandbox bind settings and `STRAWBERRY_HOST_BASE_URL`

## Agent workspace

- `apps/`: your handcrafted apps (Solidity, tests, etc.)
- `.strawberry/skills/`: your handcrafted skills
- `.strawberry/AGENTS.md`: your constitution

These directories are mounted into the agent container and persist across restarts.

## Security model

- Telegram bot token stays on the host.
- RPC URL, signer command, and private keys stay on the host. RPC is only needed when you use chain reads.
- The container agent calls the host API only; it does not receive RPC URL or signer secrets.
- Telegram reaches the agent over localhost with a bearer token.
- Guest→host auth uses `STRAWBERRY_HOST_API_KEY` bearer token.
