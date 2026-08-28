import { useEffect, useState } from 'react';
import { useStore } from '../store.js';
import { Card, StatusDot, CopyButton, RuntimeBadge } from '../components/ui.jsx';

export default function Configure() {
  const s = useStore();
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    fetch('/api/config/onboarding')
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusDot online={s.connected} />
          <span className="font-semibold">Orchestrator</span>
        </div>
        <span className="font-mono text-sm text-dim">{cfg ? `${cfg.ip}:${cfg.port}` : '…'}</span>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="flex flex-col items-center gap-3">
          <div className="text-[11px] uppercase tracking-wide text-faint self-start">Scan to open on a phone</div>
          {cfg?.qrDataUrl ? (
            <img src={cfg.qrDataUrl} alt="join QR" width={200} height={200} className="rounded-lg" />
          ) : (
            <div className="w-[200px] h-[200px] grid place-items-center text-faint">…</div>
          )}
          <div className="font-mono text-sm text-accent2 break-all text-center">{cfg?.joinUrl}</div>
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="text-[11px] uppercase tracking-wide text-faint">Onboard a phone (paste in Termux)</div>
          <div className="bg-bg rounded-lg p-2 font-mono text-xs break-all">{cfg?.setupCmd || '…'}</div>
          <div className="self-end">{cfg && <CopyButton text={cfg.setupCmd} label="Copy setup command" />}</div>

          <div className="text-[11px] uppercase tracking-wide text-faint mt-2">Hook up the MCP server (in the demo project)</div>
          <div className="bg-bg rounded-lg p-2 font-mono text-xs break-all">{cfg?.mcpAddCmd || '…'}</div>
          <div className="self-end">{cfg && <CopyButton text={cfg.mcpAddCmd} label="Copy MCP command" />}</div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wide text-faint">Phones detected</span>
          <span className="text-xs text-dim">{s.phones.filter((p) => p.status === 'online').length} online</span>
        </div>
        {s.phones.length === 0 ? (
          <div className="text-dim text-sm">No phones yet. Paste the setup command on a phone, or run <span className="font-mono">npm run mock-fleet</span>.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {s.phones.map((p) => (
              <div key={p.phoneId} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusDot online={p.status === 'online'} />
                  <span className="font-medium">{p.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {p.endpoints.map((e) => (
                    <RuntimeBadge key={e.endpointId} runtime={e.runtime} />
                  ))}
                  <a href={`/worker/${p.phoneId}`} target="_blank" rel="noreferrer" className="text-xs text-accent2 hover:underline ml-2">
                    worker view →
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
