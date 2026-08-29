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

  // Native kiosk bridge: fire a phone notification when this worker is assigned
  // a task and when it starts generating. Guarded — no-op in a plain browser
  // (window.SisyphusNative only exists inside the Android kiosk WebView).
  const notifiedRef = useRef({});
  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.SisyphusNative : null;
    if (!bridge || !active) return;
    const title = active.title || active.file || 'Worker task';
    if (notifiedRef.current.taskId !== active.taskId) {
      notifiedRef.current = { taskId: active.taskId, state: null };
    }
    if (notifiedRef.current.state === active.state) return;
    notifiedRef.current.state = active.state;
    try {
      if (active.state === 'dispatched') bridge.assigned(title);
      else if (active.state === 'generating') bridge.generating(title);
      else if (active.state === 'completed') bridge.finished(title, true);
      else if (active.state === 'failed') bridge.finished(title, false);
    } catch (e) { /* bridge missing a method — ignore */ }
  }, [active?.taskId, active?.state]);

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
          {active.gate && <GateLog gate={active.gate} />}
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

// Deterministic-gate log for the current task: every structure/syntax/regex
// check and every baked-in test case the hub ran against this phone's output.
function GateLog({ gate }) {
  const passed = gate.checks.filter((c) => c.ok).length;
  return (
    <div className="border border-border-soft">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-soft">
        <span className="text-[8px] tracking-[0.14em] uppercase text-faint">Gate · Test log</span>
        <span className="text-[10px] tabular" style={{ color: gate.passed ? 'var(--signal)' : 'var(--text)' }}>
          {gate.passed ? '■ PASSED' : '✕ FAILED'} {passed}/{gate.checks.length}
        </span>
      </div>
      <div className="scroll-y max-h-32">
        {gate.checks.map((c, i) => (
          <div key={i} className="flex items-baseline gap-2 px-3 py-1 border-b border-border-soft last:border-b-0 text-[10px]">
            <span style={{ color: c.ok ? 'var(--signal)' : 'var(--text)' }}>{c.ok ? '■' : '✕'}</span>
            <span className="text-[8px] tracking-[0.1em] uppercase text-faint w-14 shrink-0">{c.kind}</span>
            <span className="text-dim truncate">{c.name}</span>
            {c.durationMs != null && <span className="text-faint tabular ml-auto shrink-0">{c.durationMs}ms</span>}
            {!c.ok && c.detail && <span className="text-faint truncate">— {c.detail}</span>}
          </div>
        ))}
      </div>
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
