import { useState } from 'react';
import { useStore } from '../store.js';
import { Card, StatusDot, RuntimeBadge, Sparkline } from '../components/ui.jsx';

function EndpointRow({ ep }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <RuntimeBadge runtime={ep.runtime} />
      <span style={{ color: ep.healthy ? 'var(--ok)' : 'var(--err)' }}>{ep.healthy ? 'healthy' : 'down'}</span>
      <span className="text-faint font-mono">{ep.ip}:{ep.port}</span>
    </div>
  );
}

function Metric({ label, value, unit }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-faint">{label}</span>
      <span className="text-lg font-semibold tabular">
        {value}
        {unit && <span className="text-xs text-dim ml-0.5">{unit}</span>}
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
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusDot online={online} />
          <span className="text-lg font-semibold">{phone.name}</span>
        </div>
        <RuntimeBadge runtime={phone.activeRuntime} />
      </div>
      <div className="text-xs font-mono text-dim">
        {[...new Set(phone.endpoints.map((e) => e.model).filter(Boolean))].join(', ') || 'no model'}
      </div>
      <div className="flex flex-col gap-1">
        {phone.endpoints.map((e) => (
          <EndpointRow key={e.endpointId} ep={e} />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Metric label="Battery" value={t.battery ?? '—'} unit="%" />
        <Metric label="Temp" value={t.batteryTempC ?? '—'} unit="°C" />
        <Metric label="CPU" value={t.cpuLoad ?? '—'} />
        <Metric label="Mem" value={t.memUsedMB ? Math.round(t.memUsedMB / 102.4) / 10 : '—'} unit="GB" />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wide text-faint">Last 60s</span>
          <button className="text-[10px] text-dim hover:text-text" onClick={() => setMetric((m) => (m === 'temp' ? 'cpu' : 'temp'))}>
            {metric === 'temp' ? 'temp °C' : 'cpu load'} ⇄
          </button>
        </div>
        <Sparkline data={data} width={280} height={40} color={metric === 'temp' ? 'var(--warn)' : 'var(--accent-2)'} />
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-border pt-2">
        <Metric label="Tasks" value={st.tasksCompleted ?? 0} />
        <Metric label="Tokens" value={(st.tokensOut ?? 0).toLocaleString()} />
        <Metric label="Avg tok/s" value={st.avgTokPerSec ?? 0} />
      </div>
    </Card>
  );
}

export default function Vitals() {
  const s = useStore();
  if (!s.phones.length) {
    return <Card className="text-center text-dim py-10">No phones connected. Onboard one from the Configure tab.</Card>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {s.phones.map((p) => (
        <PhoneCard key={p.phoneId} phone={p} history={s.telemetry[p.phoneId]} />
      ))}
    </div>
  );
}
