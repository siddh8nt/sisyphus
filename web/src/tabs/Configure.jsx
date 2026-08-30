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

      <div className="module">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-[10px] tracking-[0.14em] uppercase text-faint">Setup commands</span>
          <span className="text-[10px] text-faint">hub → phones → mcp → /sisyphus</span>
        </div>
        <div className="flex flex-col gap-3 p-3">
          {[
            { label: '1 · Start the hub — sisyphus repo root', cmd: 'npm start' },
            { label: '2 · Connect a phone (CPU) — paste in Termux, one name per phone', cmd: cfg?.setupCmd },
            { label: '3 · Activate the NPU (optional) — laptop PowerShell, phone on USB', cmd: '.\\phone\\npu\\start-npu.ps1 -Name phone1 -Serial <adb-serial>' },
            { label: '4 · Copy the wiring into the target project (one-time)', cmd: 'Copy-Item <sisyphus>\\.mcp.json .; Copy-Item -Recurse <sisyphus>\\.claude .claude' },
            { label: '5 · Launch Claude Code from the target project, verify with /mcp', cmd: '$env:SISYPHUS_HOME = "<path-to-sisyphus>"; claude' },
            { label: '6 · Fire the skill', cmd: '/sisyphus <describe the feature to build>' },
          ].map((st) => (
            <div key={st.label} className="flex flex-col gap-1">
              <div className="text-[9px] tracking-[0.14em] uppercase text-faint">{st.label}</div>
              <div className="flex items-start gap-2">
                <div className="flex-1 bg-surface border border-border-soft p-2.5 text-[10px] leading-relaxed text-dim break-all">{st.cmd || '…'}</div>
                {st.cmd && <CopyButton text={st.cmd} label="Copy" />}
              </div>
            </div>
          ))}
        </div>
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
