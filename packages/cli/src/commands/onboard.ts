import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { fetchBotProfile } from '@strawberry/telegram/bot-profile';
import { parseOptionalTelegramUserId } from '@strawberry/telegram/config';
import { ensureLaunchPrerequisites, formatBootstrapError } from '../bootstrap.ts';
import { readEnvFile, upsertEnvFile } from '../env-file.ts';
import { hasPiAuth, runPiLogin } from '../pi-auth.ts';
import { askLine, askSecret, askYesNo } from '../prompt.ts';
import { resolveStrawberryPaths } from '../paths.ts';
import { runProduction } from '../production.ts';
import { initConfig } from '../init-config.ts';
import { ensureWorkspaceDirs } from '../workspace.ts';
import {
  printCommandHeader,
  printError,
  printHint,
  printInfo,
  printStep,
  printSuccess
} from '../tui.ts';

async function askTelegramBotToken(existing?: string): Promise<string> {
  if (existing) {
    const keep = await askYesNo('Keep your existing bot token?', true);
    if (keep) {
      return existing;
    }
  }
  const token = await askSecret('Bot token from @BotFather');
  if (!token) {
    throw new Error('Bot token is required.');
  }
  return token;
}

async function askAdminUserId(existing?: string): Promise<string> {
  let adminUserId = existing || '';
  const configureAdminDms = adminUserId
    ? await askYesNo('Keep admin DMs enabled for this Telegram user ID?', true)
    : await askYesNo('Enable private admin DMs? Group chat does not need your Telegram user ID.', false);

  if (!configureAdminDms) {
    return '';
  }

  while (true) {
    adminUserId = await askLine(
      'Telegram user ID for admin DMs (numeric — message @userinfobot)',
      adminUserId || undefined
    );
    if (!adminUserId.trim()) {
      return '';
    }
    try {
      parseOptionalTelegramUserId(adminUserId, 'STRAWBERRY_TELEGRAM_ADMIN_USER_ID');
      return adminUserId;
    } catch (error) {
      printError(error instanceof Error ? error.message : String(error));
    }
  }
}

export async function runOnboard(options: { skipBanner?: boolean } = {}): Promise<number> {
  const paths = resolveStrawberryPaths();
  mkdirSync(paths.configDir, { recursive: true, mode: 0o700 });
  mkdirSync(paths.agentDir, { recursive: true, mode: 0o700 });

  const hostEnvPath = join(paths.configDir, 'host.env');
  const telegramEnvPath = join(paths.configDir, 'telegram.env');
  const existingHost = readEnvFile(hostEnvPath);
  const existingTelegram = readEnvFile(telegramEnvPath);

  if (options.skipBanner) {
    printInfo('Setup');
  } else {
    printCommandHeader('Setup', 'A few questions, then you are ready to run');
  }

  if (process.platform === 'darwin' && !options.skipBanner) {
    try {
      printInfo('Checking Homebrew, Apple Container, and dependencies…');
      await ensureLaunchPrerequisites(paths);
    } catch (error) {
      printError(formatBootstrapError(error));
      return 1;
    }
  }

  try {
    await initConfig(paths);
  } catch (error) {
    printError(error instanceof Error ? error.message : String(error));
    return 1;
  }

  printStep(1, 'Model login', 'Sign in with Pi — Codex, Claude, or another provider.');
  if (!hasPiAuth(paths.agentDir)) {
    if (await askYesNo('Open Pi now to /login?', true)) {
      await runPiLogin(paths.installRoot, paths.workspaceRoot, paths.agentDir);
    }
  }

  if (!hasPiAuth(paths.agentDir)) {
    printError('Pi auth missing. Run `strawberry onboard` again and finish /login.');
    return 1;
  }

  printStep(2, 'Telegram bot', 'For group chat you only need the bot token, then add the bot to your group.');

  let botToken: string;
  try {
    botToken = await askTelegramBotToken(existingTelegram.STRAWBERRY_TELEGRAM_BOT_TOKEN);
  } catch (error) {
    printError(error instanceof Error ? error.message : String(error));
    return 1;
  }

  let botUsername = existingTelegram.STRAWBERRY_TELEGRAM_BOT_USERNAME?.replace(/^@/, '') || '';
  try {
    const profile = await fetchBotProfile(botToken);
    if (profile.username) {
      botUsername = profile.username;
      printHint(`Connected as @${botUsername}`);
    } else if (!botUsername) {
      printHint('No username returned. Set STRAWBERRY_TELEGRAM_BOT_USERNAME manually if @mentions fail.');
    }
  } catch (error) {
    printError(`Could not verify bot token: ${error instanceof Error ? error.message : error}`);
    return 1;
  }

  const adminUserId = await askAdminUserId(existingTelegram.STRAWBERRY_TELEGRAM_ADMIN_USER_ID);

  printStep(3, 'Chain', 'Optional for chat. Add RPC for reads; signer is only needed for transactions.');

  const rpcUrl = await askLine('RPC URL (optional, enables chain reads)', existingHost.STRAWBERRY_RPC_URL);

  let signerCommand = existingHost.STRAWBERRY_SIGNER_COMMAND || '';
  if (await askYesNo('Add a signer command now?', Boolean(signerCommand))) {
    printHint('Example: node apps/my-chain/sign-and-send.js');
    signerCommand = await askLine('Signer command', signerCommand || undefined);
  } else {
    signerCommand = '';
  }

  upsertEnvFile(telegramEnvPath, 'STRAWBERRY_TELEGRAM_BOT_TOKEN', botToken);
  if (botUsername) {
    upsertEnvFile(telegramEnvPath, 'STRAWBERRY_TELEGRAM_BOT_USERNAME', botUsername);
  }
  if (adminUserId) {
    upsertEnvFile(telegramEnvPath, 'STRAWBERRY_TELEGRAM_ADMIN_USER_ID', adminUserId);
  } else {
    upsertEnvFile(telegramEnvPath, 'STRAWBERRY_TELEGRAM_ADMIN_USER_ID', '');
  }

  upsertEnvFile(hostEnvPath, 'STRAWBERRY_RPC_URL', rpcUrl);
  upsertEnvFile(hostEnvPath, 'STRAWBERRY_SIGNER_COMMAND', signerCommand);

  ensureWorkspaceDirs(paths);

  const pairingCode = readEnvFile(telegramEnvPath).STRAWBERRY_TELEGRAM_PAIRING_CODE;
  const nextSteps = [
    'Run `strawberry`',
    'Add the bot to your Telegram group',
    'No Telegram user ID is needed for group chat',
    pairingCode
      ? `Pair the group with /pair${botUsername ? `@${botUsername}` : ''} ${pairingCode}`
      : 'Pair the group with the code in config/telegram.env',
    botUsername ? `After pairing, @mention @${botUsername} to talk` : 'After pairing, reply to the bot or @mention her to talk',
    'Edit .strawberry/AGENTS.md and add skills under .strawberry/skills/'
  ];
  if (!rpcUrl) {
    nextSteps.push('Chat works now. Add STRAWBERRY_RPC_URL later for chain reads.');
  } else if (!signerCommand) {
    nextSteps.push('Chain reads work now. Add a signer later for transactions.');
  }

  printSuccess('Setup complete', nextSteps);

  if (await askYesNo('Build the container image now? (otherwise the first run will build)', false)) {
    const build = await runProduction('build-image', paths);
    if (build !== 0) {
      return build;
    }
  }

  printHint('Start with: strawberry');
  return 0;
}
