// Tiny WebSocket tap: prints every event on the Sisyphus bus. `npm run ws-tap`.
// Optional: --filter phone_update,token to show only some types.
import WebSocket from 'ws';

const URL = process.env.SISYPHUS_WS || 'ws://127.0.0.1:4100/ws';
const filterArg = process.argv.includes('--filter')
  ? process.argv[process.argv.indexOf('--filter') + 1].split(',')
  : null;

const ws = new WebSocket(URL);

ws.on('open', () => console.log(`ws-tap connected -> ${URL}\n`));
ws.on('message', (data) => {
  let msg;
  try {
    msg = JSON.parse(data.toString());
  } catch {
    return;
  }
  if (filterArg && !filterArg.includes(msg.type)) return;
  const t = new Date(msg.ts).toISOString().slice(11, 19);
  const p = summarize(msg);
  console.log(`${t}  ${msg.type.padEnd(16)} ${p}`);
});
ws.on('close', () => console.log('ws-tap disconnected'));
ws.on('error', (e) => console.error('ws-tap error:', e.message));

function summarize(msg) {
  const pl = msg.payload || {};
  switch (msg.type) {
    case 'hello':
      return `phones=${pl.phones?.length ?? 0} session=${pl.session ?? '-'}`;
    case 'phone_update':
      return `${pl.name} ${pl.status} runtime=${pl.activeRuntime ?? '-'} ` +
        (pl.telemetry ? `bat=${pl.telemetry.battery}% temp=${pl.telemetry.batteryTempC}C cpu=${pl.telemetry.cpuLoad}` : 'no-telemetry');
    case 'reasoning':
      return `[${pl.source}] ${pl.text}`;
    case 'task_state':
      return `${pl.taskId} -> ${pl.state} ${pl.phoneId ?? ''} ${pl.runtime ?? ''}`;
    case 'token':
      return `${pl.taskId} +${JSON.stringify(pl.text)}`;
    case 'task_result':
      return `${pl.taskId} ${pl.status} ${pl.runtime} out=${pl.tokensOut} ${pl.tokPerSec}tok/s fallback=${pl.fallback}`;
    default:
      return JSON.stringify(pl).slice(0, 120);
  }
}
