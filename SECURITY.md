# Security

## Secrets

Never commit:

- `config/*.env` (use `config/*.env.example` only)
- `.strawberry/auth.json`, model settings, or state under `.strawberry/`
- `.env` files with real credentials
- `logs/`, `state/`, or runtime artifacts

The native installer clones application code only. Your Telegram bot token, RPC URLs, signer commands, and API keys belong in a local workspace (`~/.strawberry/workspace` by default), not in git.

## Reporting

Report vulnerabilities privately via GitHub Security Advisories on this repository, or open a minimal public issue without proof-of-concept exploit details if you cannot use advisories.
