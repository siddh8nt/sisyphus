// Central config — no magic numbers scattered across the codebase.
import path from 'node:path';

export const PORT = Number(process.env.SISYPHUS_PORT) || 4100;

// Timing
export const HEARTBEAT_TIMEOUT_MS = 10_000; // endpoint offline if no heartbeat within this
export const HEALTHCHECK_INTERVAL_MS = 5_000; // how often we poll each endpoint's model API
export const HEALTHCHECK_TIMEOUT_MS = 2_500; // per health-check request timeout
export const OFFLINE_SWEEP_MS = 2_000; // how often we re-evaluate online/offline status
export const MODEL_CALL_TIMEOUT_MS = 120_000; // hard timeout on a generation call

// Worker model sampling (Ollama option names; OpenAI adapter maps num_predict->max_tokens)
export const WORKER_SAMPLING = {
  temperature: 0.2,
  num_ctx: 4096,
  num_predict: 1200,
};

export const DEFAULT_MODEL = 'qwen2.5-coder:3b';

// Paths
export const SERVER_DIR = path.resolve(import.meta.dirname);
export const DATA_DIR = path.join(SERVER_DIR, 'data');
export const DB_PATH = process.env.SISYPHUS_DB || path.join(DATA_DIR, 'sisyphus.sqlite');
export const WEB_DIST = path.join(SERVER_DIR, '..', 'web', 'dist');
export const PROMPTS_DIR = path.join(SERVER_DIR, 'prompts');
