# Strawberry on macOS

Strawberry runs the **Pi agent inside an [Apple Container](https://github.com/apple/container)** — one lightweight Linux VM per container, native on Apple Silicon. Telegram and the host API (RPC URL, signer) stay on macOS.

## Prerequisites

- Mac with **Apple Silicon**
- **macOS 26** (Tahoe) or later
- [Apple Container](https://github.com/apple/container): `brew install container`

```bash
brew install container
pnpm install
pnpm verify
container system start
```

Grant **Local Network** access to `container-runtime-linux` in System Settings if port forwarding or host API calls fail.

## Run her

After the native installer:

```bash
strawberry
```

From a source checkout, use `pnpm strawberry` instead of `strawberry`.

From macOS, the CLI:

1. Starts `container system` if needed
2. Builds the agent image on first run (`ops/container/Dockerfile`)
3. Runs host API + Telegram on macOS
4. Starts a persistent agent container with mounted `.strawberry/`, `apps/`, and agent state

Press Ctrl+C to stop. The foreground view stays compact; use `strawberry logs` for host, Telegram, and agent details.

## Talk in Telegram

After `strawberry`, add your bot to a group in the Telegram app, then pair with the local `/pair` code printed during setup. Then @mention the bot or reply to one of its messages. Send `/new` to reset your session.

## Persistent workspace

These paths on your Mac are mounted into the agent container:

| Host path | Container path | Purpose |
|---|---|---|
| `.strawberry/` | `/opt/strawberry/.strawberry` | Pi auth, skills, constitution |
| `apps/` | `/opt/strawberry/apps` | Your Solidity/apps workspace |
| `state/agent/` | `/opt/strawberry/state/agent` | Agent sessions and uploads |

Files you create in the container under those mounts survive restarts.

## Manual stack commands

```bash
strawberry status
strawberry stop
container logs -f strawberry-agent
```

## Topology on macOS

```text
macOS host
  ├── Telegram gateway
  ├── Host API (0.0.0.0:4510) — RPC URL, signer secrets
  └── Apple Container: strawberry-agent
        └── Pi agent (:4501 published to 127.0.0.1)
```

The agent reaches the host API via the container bridge gateway (typically `192.168.64.1`). Chain signing never enters the container.

Rebuild the agent image after changing dependencies or `config/agent.env`:

```bash
strawberry onboard
strawberry
```
