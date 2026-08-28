import { useEffect, useRef } from 'react';
import { useStore } from './store.js';
import { StatusDot, RuntimeBadge, StateChip } from './components/ui.jsx';

export default function WorkerView({ phoneId }) {
  const s = useStore();
  const phone = s.phones.find((p) => p.phoneId === phoneId);
  const myTasks = Object.values(s.tasks).filter((t) => t.phoneId === phoneId);
  const active = myTasks.find((t) => ['dispatched', 'generating', 'validating', 'retrying'].includes(t.state)) || myTasks[myTasks.length - 1];
  const output = active ? s.outputs[active.taskId] : '';
  const t = phone?.telemetry || {};
  const online = phone?.status === 'online';
  const streaming = active && active.state === 'generating';

  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [output]);

  return (
    <div className="min-h-full flex flex-col p-5 md:p-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusDot online={online} />
          <span className="text-3xl md:text-5xl font-bold tracking-tight">{phone?.name || phoneId}</span>
          <RuntimeBadge runtime={phone?.activeRuntime} />
        </div>
        <span className="text-lg font-bold" style={{ color: 'var(--accent)' }}>SISYPHUS</span>
      </div>

      {/* Telemetry strip */}
      <div className="flex gap-6 md:gap-10 mt-4 text-dim tabular">
        <Big label="Battery" value={t.battery != null ? t.battery + '%' : '—'} />
        <Big label="Temp" value={t.batteryTempC != null ? t.batteryTempC + '°C' : '—'} />
        <Big label="CPU" value={t.cpuLoad != null ? t.cpuLoad : '—'} />
        <Big label="Mem" value={t.memUsedMB ? (t.memUsedMB / 1024).toFixed(1) + 'GB' : '—'} />
      </div>

      {active ? (
        <div className="flex-1 flex flex-col mt-6 min-h-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xl md:text-2xl font-semibold truncate">{active.title}</span>
            <StateChip state={active.state} />
          </div>
          <div className="text-sm font-mono text-dim mb-2">{active.file}</div>
          <pre
            ref={ref}
            className={`scroll-y flex-1 bg-surface border border-border rounded-2xl p-4 font-mono text-base md:text-lg leading-relaxed whitespace-pre-wrap break-words ${streaming ? 'caret' : ''}`}
            style={{ borderColor: streaming ? 'var(--accent-2)' : 'var(--border)' }}
          >
            {output || '…'}
          </pre>
          <div className="flex items-center gap-8 mt-4 text-2xl md:text-3xl font-bold tabular">
            <span>
              {active.result ? active.tokensOut : (output ? output.split(/\s+/).length : 0)}
              <span className="text-sm text-dim ml-2 font-normal">tokens</span>
            </span>
            {active.result && !active.fallback && (
              <span style={{ color: 'var(--accent-2)' }}>
                {active.tokPerSec}
                <span className="text-sm text-dim ml-2 font-normal">tok/s</span>
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 grid place-items-center">
          <div className="text-center">
            <div className="inline-block mb-4" style={{ color: 'var(--ok)' }}>
              <StatusDot online={online} className="!w-4 !h-4" />
            </div>
            <div className="text-3xl md:text-5xl font-bold text-dim">READY</div>
            <div className="text-lg text-faint mt-2">waiting for tasks</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Big({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-faint">{label}</span>
      <span className="text-2xl md:text-4xl font-bold text-text">{value}</span>
    </div>
  );
}
