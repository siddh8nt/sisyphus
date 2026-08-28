// Tiny timestamped logger. Quiet by default; SISYPHUS_DEBUG=1 for debug lines.
const DEBUG = process.env.SISYPHUS_DEBUG === '1';

function stamp() {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function line(level, args) {
  return [`${stamp()} ${level}`, ...args];
}

export const log = {
  info: (...a) => console.log(...line('·', a)),
  ok: (...a) => console.log(...line('✓', a)),
  warn: (...a) => console.warn(...line('!', a)),
  err: (...a) => console.error(...line('✗', a)),
  debug: (...a) => {
    if (DEBUG) console.log(...line('debug', a));
  },
};
