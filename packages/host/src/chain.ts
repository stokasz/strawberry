export type BlockSummary = {
  number: string;
  hash: string;
  parentHash: string;
  timestamp: string;
  miner: string;
  gasUsed: string;
  gasLimit: string;
  transactionCount: number;
};

type RpcBlock = {
  number?: string;
  hash?: string;
  parentHash?: string;
  timestamp?: string;
  miner?: string;
  gasUsed?: string;
  gasLimit?: string;
  transactions?: unknown[];
};

const MAX_BLOCK_PARAM_LENGTH = 128;

function blockRpcParam(block: string): { method: string; params: [string, boolean] } {
  const trimmed = block.trim();
  if (trimmed.length > MAX_BLOCK_PARAM_LENGTH) {
    throw Object.assign(new Error('Block parameter is too long.'), { statusCode: 400 });
  }
  if (trimmed === 'latest') {
    return { method: 'eth_getBlockByNumber', params: ['latest', false] };
  }
  if (trimmed.startsWith('0x')) {
    return { method: 'eth_getBlockByHash', params: [trimmed, false] };
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw Object.assign(new Error('Invalid block. Use latest, a block number, or a 0x hash.'), { statusCode: 400 });
  }
  return { method: 'eth_getBlockByNumber', params: [`0x${parsed.toString(16)}`, false] };
}

function toSummary(block: RpcBlock): BlockSummary {
  if (!block.number || !block.hash) {
    throw Object.assign(new Error('Block not found.'), { statusCode: 404 });
  }
  return {
    number: block.number,
    hash: block.hash,
    parentHash: block.parentHash ?? '',
    timestamp: block.timestamp ?? '0x0',
    miner: block.miner ?? '',
    gasUsed: block.gasUsed ?? '0x0',
    gasLimit: block.gasLimit ?? '0x0',
    transactionCount: block.transactions?.length ?? 0
  };
}

export async function readBlock(
  rpcUrl: string,
  block: string,
  fetchFn: typeof fetch = fetch
): Promise<BlockSummary> {
  const { method, params } = blockRpcParam(block);
  const response = await fetchFn(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });

  if (!response.ok) {
    throw Object.assign(new Error(`RPC request failed: status=${response.status}`), { statusCode: 502 });
  }

  const payload = await response.json() as { error?: { message?: string }; result?: RpcBlock | null };
  if (payload.error?.message) {
    throw Object.assign(new Error(`RPC error: ${payload.error.message}`), { statusCode: 502 });
  }
  if (!payload.result) {
    throw Object.assign(new Error('Block not found.'), { statusCode: 404 });
  }
  return toSummary(payload.result);
}
