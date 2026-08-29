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
    <div className="flex flex-col gap-5">
      <Card className="flex items-center justify-between !py-3">
        <div className="flex items-center gap-2.5">
          <StatusDot online={s.connected} />
          <span className="text-[12px] tracking-[0.08em]">Orchestrator</span>
        </div>
        <span className="text-[11px] text-faint">{cfg ? `${cfg.ip}:${cfg.port}` : '…'}</span>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border border border-border">
        <div className="flex flex-col items-center gap-3.5 p-4" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
          <div className="self-stretch text-[9px] tracking-[0.14em] uppercase" style={{ color: 'var(--text-faint)' }}>
            Scan to open on a phone
          </div>
          {cfg?.qrDataUrl ? (
            <img src={cfg.qrDataUrl} alt="join QR" width={190} height={190} style={{ border: '1px solid var(--paper-border)' }} />
          ) : (
            <div className="w-[190px] h-[190px] grid place-items-center text-[9px]" style={{ border: '1px solid var(--paper-border)', color: 'var(--text-faint)' }}>
              …
            </div>
          )}
          <div className="text-[11px] break-all text-center">{cfg?.joinUrl}</div>
        </div>

        <Card className="flex flex-col gap-2.5 !border-0">
          <div className="text-[9px] tracking-[0.14em] uppercase text-faint">Onboard a phone — paste in Termux</div>
          <div className="bg-surface border border-border-soft p-2.5 text-[10px] leading-relaxed text-dim break-all">{cfg?.setupCmd || '…'}</div>
          <div className="self-end">{cfg && <CopyButton text={cfg.setupCmd} label="Copy setup command" />}</div>

          <div className="text-[9px] tracking-[0.14em] uppercase text-faint mt-2">Hook up the MCP server — in the demo project</div>
          <div className="bg-surface border border-border-soft p-2.5 text-[10px] leading-relaxed text-dim break-all">{cfg?.mcpAddCmd || '…'}</div>
          <div className="self-end">{cfg && <CopyButton text={cfg.mcpAddCmd} label="Copy MCP command" />}</div>
        </Card>
      </div>

      <div className="module">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-[10px] tracking-[0.14em] uppercase text-faint">Phones detected</span>
          <span className="text-[10px] text-faint">{String(s.phones.filter((p) => p.status === 'online').length).padStart(2, '0')} online</span>
        </div>
        {s.phones.length === 0 ? (
          <div className="dotfield text-center py-10 flex flex-col items-center gap-2.5">
            <div className="pixel text-[24px]">(NO PHONES YET)</div>
            <div className="text-[10px] text-faint">
              Paste the setup command on a phone, or run{' '}
              <span className="px-1.5" style={{ background: 'var(--text)', color: 'var(--ink)' }}>npm run mock-fleet</span>
            </div>
          </div>
        ) : (
          <div>
            {s.phones.map((p) => (
              <div key={p.phoneId} className="flex items-center justify-between px-3 py-2.5 border-b border-border-soft last:border-b-0">
                <div className="flex items-center gap-2.5">
                  <StatusDot online={p.status === 'online'} />
                  <span className="text-[12px] tracking-[0.06em]">{p.name}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  {p.endpoints.map((e) => (
                    <RuntimeBadge key={e.endpointId} runtime={e.runtime} />
                  ))}
                  <a href={`/worker/${p.phoneId}`} target="_blank" rel="noreferrer" className="text-[10px] tracking-[0.1em] text-faint hover:text-text ml-2">
                    Worker view →
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
