import { useState } from 'react';
import { useStore } from '../store.js';
import { Card, StatusDot, RuntimeBadge, Sparkline } from '../components/ui.jsx';

function EndpointRow({ ep }) {
  return (
    <div className="flex items-baseline gap-2.5 text-[10px]">
      <RuntimeBadge runtime={ep.runtime} />
      <span style={{ color: ep.healthy ? 'var(--text)' : 'var(--text-faint)' }}>{ep.healthy ? 'healthy' : 'down'}</span>
      <span className="text-faint">{ep.ip}:{ep.port}</span>
    </div>
  );
}

function Metric({ label, value, unit }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[8px] tracking-[0.14em] uppercase text-faint">{label}</span>
      <span className="text-[15px] tabular">
        {value}
        {unit && <span className="text-[9px] text-faint ml-0.5">{unit}</span>}
      </span>
    </div>
  );
}

function PhoneCard({ phone, history }) {
  const [metric, setMetric] = useState('temp');
  const t = phone.telemetry || {};
  const online = phone.status === 'online';
  const data = (history || []).map((h) => (metric === 'temp' ? h.temp : h.cpu)).filter((x) => x != null);
  const st = phone.sessionTotals || {};
  return (
    <Card className="flex flex-col gap-3 !border-0">
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-2.5">
          <StatusDot online={online} />
          <span className="pixel text-[18px]">{phone.name}</span>
        </div>
        <RuntimeBadge runtime={phone.activeRuntime} />
      </div>
      <div className="text-[10px] text-faint">
        {[...new Set(phone.endpoints.map((e) => e.model).filter(Boolean))].join(', ') || 'no model'}
      </div>
      <div className="flex flex-col gap-1 border-t border-border-soft pt-2">
        {phone.endpoints.map((e) => (
          <EndpointRow key={e.endpointId} ep={e} />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2 border-t border-border-soft pt-2.5">
        <Metric label="Battery" value={t.battery ?? '—'} unit="%" />
        <Metric label="Temp" value={t.batteryTempC ?? '—'} unit="°C" />
        <Metric label="CPU" value={t.cpuLoad ?? '—'} />
        <Metric label="Mem" value={t.memUsedMB ? Math.round(t.memUsedMB / 102.4) / 10 : '—'} unit="GB" />
      </div>
      <div className="px-3 py-2.5" style={{ background: 'var(--paper)', border: '1px solid var(--paper-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[8px] tracking-[0.14em] uppercase" style={{ color: 'var(--text-faint)' }}>
            Last 60s · {metric === 'temp' ? 'temp °C' : 'cpu load'}
          </span>
          <button
            className="text-[9px]"
            style={{ color: 'var(--text-faint)' }}
            onClick={() => setMetric((m) => (m === 'temp' ? 'cpu' : 'temp'))}
          >
            ⇄
          </button>
        </div>
        <div className="dotfield-paper">
          <Sparkline data={data} width={280} height={44} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-border-soft pt-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[8px] tracking-[0.14em] uppercase text-faint">Tasks</span>
          <span className="pixel text-[17px] tabular">{st.tasksCompleted ?? 0}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[8px] tracking-[0.14em] uppercase text-faint">Tokens</span>
          <span className="pixel text-[17px] tabular">{(st.tokensOut ?? 0).toLocaleString()}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[8px] tracking-[0.14em] uppercase text-faint">Avg tok/s</span>
          <span className="pixel text-[17px] tabular">{st.avgTokPerSec ?? 0}</span>
        </div>
      </div>
    </Card>
  );
}

export default function Vitals() {
  const s = useStore();
  if (!s.phones.length) {
    return (
      <div className="module dotfield text-center py-24 flex flex-col items-center gap-4">
        <div className="pixel text-[46px] text-text">(NO PHONES)</div>
        <div className="text-[11px] tracking-[0.18em] text-faint">Fleet offline — 00 endpoints detected</div>
        <div className="text-[11px] text-faint">Onboard one from the Configure tab</div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border border border-border">
      {s.phones.map((p) => (
        <PhoneCard key={p.phoneId} phone={p} history={s.telemetry[p.phoneId]} />
      ))}
    </div>
  );
}
