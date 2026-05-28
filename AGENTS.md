# Strawberry Agent Instructions

Strawberry is local-first, non-custodial, Telegram-multiplayer agent infrastructure.

## Install (native)

```bash
curl -fsSL https://raw.githubusercontent.com/stokasz/strawberry/main/install.sh | bash
```

- Check architecture in `ARCHITECTURE.md` before feature work.
- Prefer test-driven changes and keep `pnpm verify` passing.
- Do not add fallbacks that bypass isolation, auth, or explicit host approval.
- Keep private keys, Telegram tokens, model keys, bearer tokens, cookies, and signed URLs out of logs.
- The host API may hold sensitive local capabilities; the guest agent must request actions through typed APIs.
- Do not add stream, vtubing, OBS, Live2D, or GPU render-plane code.
