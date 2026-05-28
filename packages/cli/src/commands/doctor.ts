import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { readRegisteredGroup } from '@strawberry/telegram/group-registry';
import { parseOptionalTelegramUserId } from '@strawberry/telegram/config';
import { readEnvFile } from '../env-file.ts';
import { hasPiAuth, readPiAuthProviders } from '../pi-auth.ts';
import { resolveStrawberryPaths } from '../paths.ts';
import { runCommand } from '../run.ts';
import { printDoctorCheck, printDoctorHeader } from '../tui.ts';

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

async function probeUrl(url: string, bearer?: string): Promise<boolean> {
  const args = ['-fsS', '--max-time', '3', url];
  if (bearer) {
    args.push('-H', `Authorization: Bearer ${bearer}`);
  }
  const result = await runCommand('curl', args);
  return result.code === 0;
}

export async function runDoctor(): Promise<number> {
  const checks: Check[] = [];
  let paths;

  printDoctorHeader();

  try {
    paths = resolveStrawberryPaths();
    checks.push({ name: 'install', ok: true, detail: paths.installRoot });
    checks.push({ name: 'workspace', ok: true, detail: paths.workspaceRoot });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({ name: 'repo', ok: false, detail: message });
    printChecks(checks);
    return 1;
  }

  const configFiles = ['strawberry.env', 'host.env', 'telegram.env', 'agent.env'] as const;
  for (const file of configFiles) {
    const path = join(paths.configDir, file);
    checks.push({
      name: `config/${file}`,
      ok: existsSync(path),
      detail: existsSync(path) ? 'present' : 'missing — run strawberry onboard'
    });
  }

  const hostEnv = readEnvFile(join(paths.configDir, 'host.env'));
  const telegramEnv = readEnvFile(join(paths.configDir, 'telegram.env'));
  const strawberryEnv = readEnvFile(join(paths.configDir, 'strawberry.env'));

  checks.push({
    name: 'pi auth',
    ok: hasPiAuth(paths.agentDir),
    detail: hasPiAuth(paths.agentDir)
      ? `providers: ${readPiAuthProviders(paths.agentDir).join(', ')}`
      : 'missing — run strawberry onboard'
  });

  checks.push({
    name: 'telegram token',
    ok: Boolean(telegramEnv.STRAWBERRY_TELEGRAM_BOT_TOKEN),
    detail: telegramEnv.STRAWBERRY_TELEGRAM_BOT_TOKEN ? 'set' : 'missing'
  });

  const adminUserRaw = telegramEnv.STRAWBERRY_TELEGRAM_ADMIN_USER_ID?.trim();
  if (adminUserRaw) {
    try {
      parseOptionalTelegramUserId(adminUserRaw, 'STRAWBERRY_TELEGRAM_ADMIN_USER_ID');
      checks.push({
        name: 'telegram admin user id',
        ok: true,
        detail: adminUserRaw
      });
    } catch (error) {
      checks.push({
        name: 'telegram admin user id',
        ok: false,
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const telegramStateRoot = telegramEnv.STRAWBERRY_TELEGRAM_STATE_ROOT?.trim()
    || join(paths.agentDir, 'state', 'telegram');
  const registeredGroup = await readRegisteredGroup(telegramStateRoot);
  const pairedGroupId = telegramEnv.STRAWBERRY_TELEGRAM_GROUP_CHAT_ID || registeredGroup?.chatId?.toString();

  checks.push({
    name: 'telegram group',
    ok: Boolean(pairedGroupId),
    detail: pairedGroupId
      ? pairedGroupId
      : 'not paired yet — start and add the bot to a group'
  });

  checks.push({
    name: 'rpc url',
    ok: Boolean(hostEnv.STRAWBERRY_RPC_URL),
    detail: hostEnv.STRAWBERRY_RPC_URL ? 'set' : 'optional until you use chain reads'
  });

  checks.push({
    name: 'signer command',
    ok: Boolean(hostEnv.STRAWBERRY_SIGNER_COMMAND),
    detail: hostEnv.STRAWBERRY_SIGNER_COMMAND
      ? 'set'
      : 'optional until you execute transactions'
  });

  checks.push({
    name: 'agent api key',
    ok: Boolean(telegramEnv.STRAWBERRY_AGENT_API_KEY),
    detail: telegramEnv.STRAWBERRY_AGENT_API_KEY ? 'set' : 'run strawberry onboard'
  });

  checks.push({
    name: 'host api key',
    ok: Boolean(hostEnv.STRAWBERRY_HOST_API_KEY),
    detail: hostEnv.STRAWBERRY_HOST_API_KEY ? 'set' : 'run strawberry onboard'
  });

  checks.push({
    name: 'telegram bot username',
    ok: Boolean(telegramEnv.STRAWBERRY_TELEGRAM_BOT_USERNAME) || Boolean(telegramEnv.STRAWBERRY_TELEGRAM_BOT_TOKEN),
    detail: telegramEnv.STRAWBERRY_TELEGRAM_BOT_USERNAME
      ? `@${telegramEnv.STRAWBERRY_TELEGRAM_BOT_USERNAME.replace(/^@/, '')}`
      : telegramEnv.STRAWBERRY_TELEGRAM_BOT_TOKEN
        ? 'auto at gateway start'
        : 'missing'
  });

  const containerImage = strawberryEnv.STRAWBERRY_CONTAINER_IMAGE || 'strawberry-agent:local';
  const containerInstalled = await runCommand('bash', ['-lc', 'command -v container'], { cwd: paths.installRoot });
  checks.push({
    name: 'apple container',
    ok: containerInstalled.code === 0,
    detail: containerInstalled.code === 0 ? 'installed' : 'missing — brew install container'
  });

  const imageInspect = await runCommand('container', ['image', 'inspect', containerImage], { cwd: paths.installRoot });
  checks.push({
    name: 'agent container image',
    ok: imageInspect.code === 0,
    detail: imageInspect.code === 0 ? containerImage : 'missing — first run will build'
  });

  const containerName = strawberryEnv.STRAWBERRY_CONTAINER_NAME || 'strawberry-agent';
  const containerInspect = await runCommand('container', ['inspect', containerName], { cwd: paths.installRoot });
  checks.push({
    name: 'agent container',
    ok: containerInspect.code === 0,
    detail: containerInspect.code === 0 ? `running (${containerName})` : 'not running'
  });

  const hostHealthUrl = `http://127.0.0.1:${hostEnv.STRAWBERRY_HOST_PORT || '4510'}/api/health`;
  const agentHealthUrl = `http://127.0.0.1:${strawberryEnv.STRAWBERRY_AGENT_PORT || '4501'}/api/health`;
  const hostUp = await probeUrl(hostHealthUrl);
  const agentUp = await probeUrl(agentHealthUrl, telegramEnv.STRAWBERRY_AGENT_API_KEY);
  checks.push({
    name: 'host api',
    ok: hostUp,
    detail: hostUp ? 'healthy' : 'not reachable'
  });
  checks.push({
    name: 'agent',
    ok: agentUp,
    detail: agentUp ? 'healthy' : 'not reachable'
  });

  printChecks(checks);
  const optional = new Set([
    'signer command',
    'rpc url',
    'telegram group',
    'agent container image',
    'agent container',
    'host api',
    'agent'
  ]);
  return checks.filter((check) => !optional.has(check.name)).every((check) => check.ok) ? 0 : 1;
}

function printChecks(checks: Check[]): void {
  for (const check of checks) {
    printDoctorCheck(check.name, check.ok, check.detail);
  }
  console.log('');
}
