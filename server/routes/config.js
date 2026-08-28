import express from 'express';
import QRCode from 'qrcode';
import { PORT } from '../config.js';
import { lanIp } from '../lib/netip.js';

export const configRouter = express.Router();

// Everything the Configure tab needs to onboard a phone.
configRouter.get('/onboarding', async (_req, res) => {
  const ip = lanIp();
  const base = `http://${ip}:${PORT}`;
  const joinUrl = `${base}/`;
  const setupCmd = `curl -s ${base}/setup.sh | sh -s -- --name phone1`;
  const mcpAddCmd = `claude mcp add sisyphus --env SISYPHUS_ORCH=http://127.0.0.1:${PORT} -- node ../../mcp/index.js`;
  const mcpSnippet = JSON.stringify(
    {
      mcpServers: {
        sisyphus: {
          command: 'node',
          args: ['../../mcp/index.js'],
          env: { SISYPHUS_ORCH: `http://127.0.0.1:${PORT}` },
        },
      },
    },
    null,
    2
  );
  let qrDataUrl = null;
  try {
    qrDataUrl = await QRCode.toDataURL(joinUrl, { margin: 1, width: 240, color: { dark: '#e7e9ee', light: '#0a0b0f00' } });
  } catch {
    /* qr optional */
  }
  res.json({ ip, port: PORT, base, joinUrl, setupCmd, mcpAddCmd, mcpSnippet, qrDataUrl });
});
