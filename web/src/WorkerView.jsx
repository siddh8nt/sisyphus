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
    <div className="min-h-full flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <StatusDot online={online} />
          <span className="pixel text-[30px] md:text-[40px]">{phone?.name || phoneId}</span>
          <RuntimeBadge runtime={phone?.activeRuntime} />
        </div>
        <span className="pixel text-[13px] text-faint">SISYPHUS</span>
      </div>

      {/* Telemetry strip */}
      <div className="flex border-b border-border tabular">
        <Big label="Battery" value={t.battery != null ? t.battery + '%' : '—'} />
        <Big label="Temp" value={t.batteryTempC != null ? t.batteryTempC + '°C' : '—'} />
        <Big label="CPU" value={t.cpuLoad != null ? t.cpuLoad : '—'} />
        <Big label="Mem" value={t.memUsedMB ? (t.memUsedMB / 1024).toFixed(1) + 'GB' : '—'} last />
      </div>

      {active ? (
        <div className="flex-1 flex flex-col p-5 gap-2.5 min-h-0">
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] tracking-[0.06em] truncate">{active.title}</span>
            <StateChip state={active.state} />
          </div>
          <div className="text-[10px] text-faint">{active.file}</div>
          <pre
            ref={ref}
            className={`scroll-y flex-1 dotfield bg-surface border border-border p-3.5 text-[12px] md:text-sm leading-[1.7] whitespace-pre-wrap break-words text-dim ${streaming ? 'caret' : ''}`}
          >
            {output || '…'}
          </pre>
          <div className="flex items-baseline gap-7 border-t border-border-soft pt-3 tabular">
            <span>
              <span className="pixel text-[30px]">{active.result ? active.tokensOut : output ? output.split(/\s+/).length : 0}</span>
              <span className="text-[9px] tracking-[0.14em] uppercase text-faint ml-2">tokens</span>
            </span>
            {active.result && !active.fallback && (
              <span>
                <span className="pixel text-[30px]" style={{ color: 'var(--signal)' }}>{active.tokPerSec}</span>
                <span className="text-[9px] tracking-[0.14em] uppercase text-faint ml-2">tok/s</span>
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 grid place-items-center dotfield">
          <div className="text-center flex flex-col items-center gap-3.5">
            <span className="inline-block w-3 h-3" style={{ background: online ? 'var(--signal)' : 'var(--border)' }} />
            <div className="pixel text-[44px]">(READY)</div>
            <div className="text-[10px] tracking-[0.18em] uppercase text-faint">Waiting for tasks</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Big({ label, value, last }) {
  return (
    <div className={`flex-1 flex flex-col py-3 pl-5 ${last ? '' : 'border-r border-border-soft'}`}>
      <span className="text-[8px] tracking-[0.14em] uppercase text-faint">{label}</span>
      <span className="pixel text-[22px] md:text-[26px] text-text">{value}</span>
    </div>
  );
}
