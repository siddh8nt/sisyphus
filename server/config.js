// Central config — no magic numbers scattered across the codebase.
import path from 'node:path';

export const PORT = Number(process.env.SISYPHUS_PORT) || 4100;

// Timing
export const HEARTBEAT_TIMEOUT_MS = 10_000; // endpoint offline if no heartbeat within this
export const HEALTHCHECK_INTERVAL_MS = 5_000; // how often we poll each endpoint's model API
export const HEALTHCHECK_TIMEOUT_MS = 2_500; // per health-check request timeout
export const OFFLINE_SWEEP_MS = 2_000; // how often we re-evaluate online/offline status
export const MODEL_CALL_TIMEOUT_MS = 120_000; // hard timeout on a generation call
export const APPROVAL_TIMEOUT_MS = 120_000; // routing plan auto-approves if the operator doesn't act
export const TEST_RUN_TIMEOUT_MS = 20_000; // whole baked-in test harness run, per attempt
export const PER_TEST_TIMEOUT_MS = 5_000; // one baked-in test case inside the harness

// ETA model for the approval table: estTokens / tok-per-sec + fixed overhead.
// Session-observed tok/s per phone wins; these are the cold-start defaults.
export const ETA_TOK_PER_SEC = { npu: 20, cpu: 8 };
export const ETA_OVERHEAD_SEC = 4;

// Worker model sampling (Ollama option names; OpenAI adapter maps num_predict->max_tokens)
export const WORKER_SAMPLING = {
  temperature: 0.2,
  num_ctx: 4096,
  num_predict: 1200,
};

export const DEFAULT_MODEL = 'qwen2.5-coder:3b';

// Cloud-cost savings metric. Methodology (deliberately conservative — a floor):
// every output token of a gate-passed on-device task is a token the cloud agent
// would otherwise have had to GENERATE itself, so it's billed at the cloud
// output-token rate only. Real-but-excluded savings: input-side costs (specs,
// context re-reads) and the fact that applied code never re-enters Claude's
// context as input tokens on later turns. Rates as of 2026-08-30:
// Claude Fable 5 API output = $50/MTok; USD→INR ≈ 95.4.
export const CLOUD_PRICING = {
  model: process.env.SISYPHUS_CLOUD_MODEL || 'claude-fable-5',
  outputUsdPerMTok: Number(process.env.SISYPHUS_USD_PER_MTOK_OUT) || 50,
  usdToInr: Number(process.env.SISYPHUS_USD_INR) || 95.4,
};

// Paths
export const SERVER_DIR = path.resolve(import.meta.dirname);
export const DATA_DIR = path.join(SERVER_DIR, 'data');
export const DB_PATH = process.env.SISYPHUS_DB || path.join(DATA_DIR, 'sisyphus.sqlite');
export const WEB_DIST = path.join(SERVER_DIR, '..', 'web', 'dist');
export const PROMPTS_DIR = path.join(SERVER_DIR, 'prompts');
