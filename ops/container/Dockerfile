# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  git \
  iproute2 \
  python3 \
  python3-venv \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.4.0 --activate

RUN curl -fsSL https://foundry.paradigm.xyz | bash \
  && /root/.foundry/bin/foundryup \
  && ln -sf /root/.foundry/bin/forge /usr/local/bin/forge \
  && ln -sf /root/.foundry/bin/cast /usr/local/bin/cast \
  && ln -sf /root/.foundry/bin/anvil /usr/local/bin/anvil

WORKDIR /opt/strawberry

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages packages
COPY apps apps

RUN pnpm install --frozen-lockfile

ENV STRAWBERRY_AGENT_BIND_HOST=0.0.0.0
ENV STRAWBERRY_AGENT_DIR=/opt/strawberry/.strawberry
ENV STRAWBERRY_AGENT_STATE_ROOT=/opt/strawberry/state/agent

EXPOSE 4501

CMD ["pnpm", "--filter", "@strawberry/agent", "start"]
