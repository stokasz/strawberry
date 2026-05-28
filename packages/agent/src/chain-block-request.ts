import { parseCliPairs, required } from './args.ts';
import { parseHostRequestContext, postHostJson, type HostRequestContext } from './host-request-common.ts';

export type ChainBlockRequestArgs = HostRequestContext & {
  block: string;
};

export type ChainBlockResponse = {
  number: string;
  hash: string;
  parentHash: string;
  timestamp: string;
  miner: string;
  gasUsed: string;
  gasLimit: string;
  transactionCount: number;
};

export function parseChainBlockRequestArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env
): ChainBlockRequestArgs {
  const pairs = parseCliPairs(argv);
  return {
    ...parseHostRequestContext(pairs, env),
    block: required(pairs.get('block'), 'arg --block')
  };
}

export async function requestChainBlock(input: ChainBlockRequestArgs): Promise<ChainBlockResponse> {
  return postHostJson<ChainBlockResponse>(
    input,
    '/api/chain/block',
    {
      chatId: input.chatId,
      telegramUserId: input.telegramUserId,
      block: input.block
    },
    'Host chain block API'
  );
}

async function main(): Promise<void> {
  const result = await requestChainBlock(parseChainBlockRequestArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
