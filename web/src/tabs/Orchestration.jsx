import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { Card, StateChip, RuntimeBadge } from '../components/ui.jsx';
import { taskSavedInr, fmtInr, funFact, DEFAULT_PRICING } from '../lib/cost.js';

// Ticks while running; freezes at `stopAt` (a timestamp) once the run has settled.
function useElapsed(startedAt, stopAt) {
  const [, force] = useState(0);
  const running = startedAt && !stopAt;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [running]);
  if (!startedAt) return '0.0s';
  return (((stopAt || Date.now()) - startedAt) / 1000).toFixed(1) + 's';
}

// The headline metric: cloud spend avoided by the fleet this session. Pops in
// on the first gate-passed on-device task and grows live as results land.
// Conservative by construction — on-device output tokens × cloud OUTPUT rate
// only (input-side savings aren't counted), so every rupee shown is defensible.
function SavingsBanner({ tasks, stats, plan, pricing }) {
  const p = pricing || DEFAULT_PRICING;
  const list = Object.values(tasks);
  const doneOnDevice = list.filter((t) => t.state === 'completed' && !t.fallback);
  const tokens = stats ? stats.cloudTokensSaved : doneOnDevice.reduce((s, t) => s + (t.tokensOut || 0), 0);
  const inr = stats?.cloudCostSavedINR ?? list.reduce((s, t) => s + taskSavedInr(t, p), 0);
  // Denominator: every leaf the plan named, phone-bound and Claude-kept alike.
  // Falls back to the live task list before the plan lands.
  const planned = plan?.tasks?.length || list.length;
  const share = stats?.onDeviceShare ?? (planned ? doneOnDevice.length / planned : 0);
  if (!(inr > 0)) return null;
  const fact = funFact(inr, tokens);
  return (
    <div className="pop-in" style={{ background: 'var(--gold)', color: 'var(--ink)', border: '1px solid var(--gold-border)' }}>
      <div className="flex items-center px-4 py-2 border-b" style={{ borderColor: 'var(--gold-deep)' }}>
        <span className="text-[11px] tracking-[0.06em] font-medium">
          <span className="inline-block w-2 h-2 mr-2" style={{ background: 'var(--ink)' }} />
          Cloud spend avoided
        </span>
      </div>
      <div className="dotfield-gold flex flex-col md:flex-row md:items-end justify-between gap-3 px-4 pt-4 pb-3">
        <div className="flex items-end gap-7">
          <span className="pixel tabular text-[52px] md:text-[64px] leading-none">{fmtInr(inr)}</span>
          {share > 0 && (
            <span className="flex flex-col leading-none">
              <span className="pixel tabular text-[40px] md:text-[48px]">{Math.round(share * 100)}%</span>
              <span className="text-[10px] tracking-[0.12em] uppercase mt-1.5">ran on-device</span>
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-5 tabular pb-1 italic">
          <span className="text-[12px]">{tokens.toLocaleString('en-IN')} tok on-device</span>
          <span className="text-[12px]">{doneOnDevice.length || stats?.tasksOnDevice || 0} task(s)</span>
        </div>
      </div>
      {fact && (
        <div className="px-4 py-2 border-t text-[11px] italic" style={{ borderColor: 'var(--gold-deep)' }}>
          {fact}
        </div>
      )}
    </div>
  );
}

function ReasoningFeed({ reasoning }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [reasoning.length]);
  return (
    <Card className="flex flex-col h-64 md:h-72 !p-0">
      <div className="micro px-3 py-2 border-b border-border">Reasoning</div>
      <div ref={ref} className="scroll-y dotfield text-[12px] leading-relaxed flex-1 p-3.5">
        {reasoning.length === 0 && <div className="text-faint">Waiting for a /sisyphus session…</div>}
        {reasoning.map((r, i) => (
          <div key={i} className="mb-2 flex items-baseline gap-2.5">
            <span
              className="chip text-[9px] px-1.5 py-px shrink-0"
              style={
                r.source === 'claude'
                  ? { background: 'var(--text)', color: 'var(--ink)' }
                  : { border: '1px solid var(--text-faint)', color: 'var(--text)' }
              }
            >
              {r.source === 'claude' ? 'Claude' : 'Sisyphus'}
            </span>
            <span className="text-dim">{r.text}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PlanColumns({ plan }) {
  if (!plan) return null;
  const phone = plan.tasks.filter((t) => t.assign !== 'claude');
  const claude = plan.tasks.filter((t) => t.assign === 'claude');
  const Col = ({ title, glyph, items }) => (
    <div className="module">
      <div className="flex justify-between px-3 py-2 border-b border-border text-[10px] tracking-[0.14em]">
        <span>
          {glyph} {title}
        </span>
        <span className="text-faint">· {String(items.length).padStart(2, '0')}</span>
      </div>
      <div>
        {items.map((t) => (
          <div key={t.taskId} className="px-3 py-2.5 border-b border-border-soft last:border-b-0">
            <div className="text-[12px]">{t.title}</div>
            {(t.file || t.rationale) && (
              <div className="text-[10px] text-faint mt-0.5">
                {t.file}
                {t.file && t.rationale ? ' — ' : ''}
                {t.rationale}
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && <div className="px-3 py-2.5 text-xs text-faint">—</div>}
      </div>
    </div>
  );
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border border border-border">
      <div className="bg-bg">
        <Col title="On phones" glyph="■" items={phone} />
      </div>
      <div className="bg-bg">
        <Col title="Claude keeps" glyph="□" items={claude} />
      </div>
    </div>
  );
}

// Routing approval: Claude proposed this dispatch table; nothing runs on a
// phone until the operator approves here. Toggling a row hands that task back
// to Claude instead.
function ApprovalTable({ approval }) {
  const [toClaude, setToClaude] = useState({}); // taskId -> true when rerouted
  const [busy, setBusy] = useState(false);
  const rows = approval.tasks || [];
  const reroutedCount = rows.filter((r) => toClaude[r.taskId]).length;

  const approve = async () => {
    setBusy(true);
    const overrides = {};
    for (const r of rows) if (toClaude[r.taskId]) overrides[r.taskId] = 'claude';
    try {
      await fetch('/api/session/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ overrides }),
      });
    } catch {
      setBusy(false); // hub unreachable — let the operator retry
    }
  };

  return (
    <div className="module">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-[10px] tracking-[0.14em] uppercase">
          <span className="inline-block w-2 h-2 mr-2" style={{ background: 'var(--signal)' }} />
          Routing plan — awaiting your approval
        </span>
        <span className="text-[10px] text-faint tabular">{rows.length} task(s) → phones</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr className="text-[9px] tracking-[0.14em] uppercase text-faint">
              {['Phone', 'Task', 'Model', 'ETA', 'Confidence', 'Tests', 'Run on'].map((h) => (
                <th key={h} className="text-left font-normal px-3 py-2 border-b border-border-soft">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const claude = !!toClaude[r.taskId];
              return (
                <tr key={r.taskId} className="border-b border-border-soft last:border-b-0">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={claude ? 'text-faint line-through' : ''}>{r.phoneName}</span>{' '}
                    {!claude && <RuntimeBadge runtime={r.runtime} />}
                  </td>
                  <td className="px-3 py-2">
                    <div>{r.title}</div>
                    <div className="text-[9px] text-faint">{r.file}</div>
                  </td>
                  <td className="px-3 py-2 text-dim whitespace-nowrap">{claude ? 'claude' : r.model || '—'}</td>
                  <td className="px-3 py-2 tabular whitespace-nowrap">{claude ? '—' : r.etaSec != null ? `~${r.etaSec}s` : '—'}</td>
                  <td className="px-3 py-2 tabular whitespace-nowrap">{r.confidence != null ? `${r.confidence}%` : '—'}</td>
                  <td className="px-3 py-2 tabular">{r.tests || 0}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setToClaude((m) => ({ ...m, [r.taskId]: !m[r.taskId] }))}
                      disabled={busy}
                      className="text-[9px] tracking-[0.12em] px-2 py-1 border transition-colors"
                      style={
                        claude
                          ? { background: 'var(--text)', color: 'var(--ink)', borderColor: 'var(--text)' }
                          : { borderColor: 'var(--border)', color: 'var(--text)' }
                      }
                      title="Toggle who runs this task"
                    >
                      {claude ? '□ CLAUDE' : '■ PHONE'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-3 py-2.5 border-t border-border">
        <span className="text-[9px] tracking-[0.14em] uppercase text-faint">
          Auto-approves in {Math.round((approval.timeoutMs || 120000) / 1000)}s if untouched
        </span>
        <button
          onClick={approve}
          disabled={busy}
          className="text-[10px] tracking-[0.14em] px-4 py-2"
          style={{ background: 'var(--text)', color: 'var(--ink)', opacity: busy ? 0.5 : 1 }}
        >
          {busy ? 'DISPATCHING…' : `APPROVE · ${rows.length - reroutedCount} → PHONES${reroutedCount ? ` · ${reroutedCount} → CLAUDE` : ''}`}
        </button>
      </div>
    </div>
  );
}

function TaskCard({ task, output }) {
  const streaming = task.state === 'generating';
  return (
    <Card className="!border-0">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="text-[12px] tracking-[0.04em] truncate">{task.title || task.taskId}</div>
        <div className="flex items-baseline gap-1.5 shrink-0">
          <RuntimeBadge runtime={task.runtime} />
          <StateChip state={task.state} />
        </div>
      </div>
      <div className="text-[10px] text-faint mb-2 truncate">
        {task.file} {task.phoneName ? `· ${task.phoneName}` : ''}
      </div>
      <pre
        className={`scroll-y text-[10px] leading-[1.55] bg-surface border border-border-soft p-2 h-28 whitespace-pre-wrap break-words text-dim ${streaming ? 'caret' : ''}`}
      >
        {output || (task.state === 'completed' ? '' : '…')}
      </pre>
      {task.result && (
        <div className="text-[10px] text-faint mt-2 tabular">
          {task.status === 'reassigned' ? (
            <span>□ rerouted to Claude by operator</span>
          ) : task.fallback ? (
            <span>✕ fell back to Claude</span>
          ) : (
            <>
              {task.tokensOut} tok · {task.tokPerSec} tok/s ·{' '}
              {task.savedInr > 0 && (
                <span style={{ color: 'var(--gold)' }}>{fmtInr(task.savedInr)} saved · </span>
              )}
              {(task.durationMs / 1000).toFixed(1)}s
            </>
          )}
          {task.gate && (
            <span className="ml-2">
              · gate {task.gate.passed ? '■' : '✕'} {task.gate.checks.filter((c) => c.ok).length}/{task.gate.checks.length}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

function Scoreboard({ tasks, plan, stats, session }) {
  const list = Object.values(tasks);
  const onDevice = stats ? stats.tasksOnDevice : list.filter((t) => t.state === 'completed' && !t.fallback).length;
  // Kept tasks that aren't dispatched phone tasks — reassigned ones already
  // count via the fallback filter below, so exclude them to avoid double-counting.
  const inList = new Set(list.map((t) => t.taskId));
  const keptOnly = plan ? plan.tasks.filter((t) => t.assign === 'claude' && !inList.has(t.taskId)).length : 0;
  const cloud = stats ? stats.tasksCloud : list.filter((t) => t.fallback).length + keptOnly;
  const npu = stats ? stats.npuTasks : list.filter((t) => t.state === 'completed' && !t.fallback && t.runtime === 'npu').length;
  const saved = stats ? stats.cloudTokensSaved : list.filter((t) => t.state === 'completed' && !t.fallback).reduce((s, t) => s + (t.tokensOut || 0), 0);

  // Freeze the timer once every phone task has settled, even if the session
  // hasn't been formally completed via sisyphus_complete yet.
  const TERMINAL = ['completed', 'failed', 'fallback_claude'];
  const expectedPhoneTasks = plan ? plan.tasks.filter((t) => t.assign !== 'claude').length : 0;
  const allSettled =
    list.length > 0 &&
    list.length >= expectedPhoneTasks &&
    list.every((t) => t.result || TERMINAL.includes(t.state));
  const stopRef = useRef({ id: null, at: null });
  if (session && stopRef.current.id !== session.id) stopRef.current = { id: session.id, at: null };
  if (allSettled && stopRef.current.at == null) stopRef.current.at = Date.now();
  const stopAt =
    session?.completed && stats ? session.startedAt + stats.wallClockMs : allSettled ? stopRef.current.at : null;
  const elapsed = useElapsed(session?.startedAt, stopAt);
  const live = session && !stopAt;
  const Item = ({ label, value, signal }) => (
    <div className="flex-1 flex flex-col items-center py-3.5 border-r last:border-r-0" style={{ borderColor: 'var(--paper-border)' }}>
      <span className="pixel text-[26px] tabular inline-flex items-center gap-2">
        {signal && <span className="inline-block w-2 h-2" style={{ background: 'var(--signal)' }} />}
        {value}
      </span>
      <span className="text-[9px] tracking-[0.14em] uppercase" style={{ color: 'var(--text-faint)' }}>
        {label}
      </span>
    </div>
  );
  return (
    <div className="sticky bottom-0 mt-3 flex" style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--paper-border)' }}>
      <Item label="On device" value={onDevice} />
      <Item label="Cloud" value={cloud} />
      <Item label="NPU tasks" value={npu} />
      <Item label="Tokens saved" value={saved} />
      <Item
        label={stopAt ? 'Total' : 'Elapsed'}
        value={elapsed}
        signal={live}
      />
    </div>
  );
}

export default function Orchestration() {
  const s = useStore();
  const phoneTasks = Object.values(s.tasks);
  return (
    <div className="flex flex-col gap-5 pb-2">
      {s.session && (
        <div className="text-[11px] flex items-baseline gap-2.5">
          <span className="micro">Session</span> {s.session.prompt || '(unnamed)'}{' '}
          {s.session.completed && <span className="text-faint">· done</span>}
        </div>
      )}
      <SavingsBanner tasks={s.tasks} stats={s.stats} plan={s.plan} pricing={s.pricing} />
      <ReasoningFeed reasoning={s.reasoning} />
      {s.approval && !s.approval.resolved && <ApprovalTable key={s.approval.requestedAt} approval={s.approval} />}
      <PlanColumns plan={s.plan} />
      {phoneTasks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border border border-border">
          {phoneTasks.map((t) => (
            <TaskCard key={t.taskId} task={t} output={s.outputs[t.taskId]} />
          ))}
        </div>
      )}
      {(s.session || phoneTasks.length > 0) && <Scoreboard tasks={s.tasks} plan={s.plan} stats={s.stats} session={s.session} />}
      {!s.session && phoneTasks.length === 0 && (
        <div className="module dotfield text-center py-24 flex flex-col items-center gap-4">
          <div className="pixel text-[46px] text-text">(STANDBY)</div>
          <div className="text-[11px] tracking-[0.18em] text-faint">No active session</div>
          <div className="text-[11px] text-faint">
            Run <span className="px-1.5" style={{ background: 'var(--text)', color: 'var(--ink)' }}>/sisyphus &lt;prompt&gt;</span> in the demo project
          </div>
        </div>
      )}
    </div>
  );
}
