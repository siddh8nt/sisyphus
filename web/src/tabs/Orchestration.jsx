import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { Card, StateChip, RuntimeBadge } from '../components/ui.jsx';

function useElapsed(startedAt, running) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [running]);
  if (!startedAt) return '0.0s';
  return ((Date.now() - startedAt) / 1000).toFixed(1) + 's';
}

function ReasoningFeed({ reasoning }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [reasoning.length]);
  return (
    <Card className="flex flex-col h-64 md:h-72">
      <div className="text-[11px] uppercase tracking-wide text-faint mb-2">Reasoning</div>
      <div ref={ref} className="scroll-y font-mono text-[13px] leading-relaxed flex-1 pr-1">
        {reasoning.length === 0 && <div className="text-faint">Waiting for a /sisyphus session…</div>}
        {reasoning.map((r, i) => (
          <div key={i} className="mb-1.5">
            <span
              className="chip text-[9px] font-bold px-1.5 py-0.5 rounded mr-2 align-middle"
              style={
                r.source === 'claude'
                  ? { background: 'var(--claude)', color: '#0a0b0f' }
                  : { background: 'var(--accent)', color: '#0a0b0f' }
              }
            >
              {r.source === 'claude' ? 'CLAUDE' : 'SISYPHUS'}
            </span>
            <span className="text-text align-middle">{r.text}</span>
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
  const Col = ({ title, items, color }) => (
    <Card>
      <div className="text-[11px] uppercase tracking-wide mb-2" style={{ color }}>
        {title} · {items.length}
      </div>
      <div className="flex flex-col gap-2">
        {items.map((t) => (
          <div key={t.taskId} className="rounded-lg p-2 border" style={{ borderColor: 'var(--border)', background: `color-mix(in srgb, ${color} 8%, transparent)` }}>
            <div className="text-sm font-medium">{t.title}</div>
            {t.file && <div className="text-xs font-mono text-dim">{t.file}</div>}
            {t.rationale && <div className="text-xs text-faint mt-0.5">{t.rationale}</div>}
          </div>
        ))}
        {items.length === 0 && <div className="text-xs text-faint">—</div>}
      </div>
    </Card>
  );
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Col title="On phones" items={phone} color="var(--accent)" />
      <Col title="Claude keeps" items={claude} color="var(--claude)" />
    </div>
  );
}

function TaskCard({ task, output }) {
  const streaming = task.state === 'generating';
  const border =
    task.state === 'completed' ? 'var(--ok)' : task.fallback || task.state === 'failed' || task.state === 'fallback_claude' ? 'var(--err)' : task.state === 'retrying' ? 'var(--warn)' : streaming ? 'var(--accent-2)' : 'var(--border)';
  return (
    <Card style={{ borderColor: border }}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-sm font-semibold truncate">{task.title || task.taskId}</div>
        <div className="flex items-center gap-1.5 shrink-0">
          <RuntimeBadge runtime={task.runtime} />
          <StateChip state={task.state} />
        </div>
      </div>
      <div className="text-xs font-mono text-dim mb-2 truncate">
        {task.file} {task.phoneName ? `· ${task.phoneName}` : ''}
      </div>
      <pre
        className={`scroll-y font-mono text-[11px] leading-snug bg-bg rounded-lg p-2 h-28 whitespace-pre-wrap break-words ${streaming ? 'caret' : ''}`}
        style={{ borderColor: border }}
      >
        {output || (task.state === 'completed' ? '' : '…')}
      </pre>
      {task.result && (
        <div className="text-xs text-dim mt-2 tabular">
          {task.fallback ? (
            <span style={{ color: 'var(--err)' }}>fell back to Claude</span>
          ) : (
            <>
              {task.tokensOut} tok · {task.tokPerSec} tok/s · {(task.durationMs / 1000).toFixed(1)}s
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function Scoreboard({ tasks, plan, stats, session }) {
  const list = Object.values(tasks);
  const onDevice = stats ? stats.tasksOnDevice : list.filter((t) => t.state === 'completed' && !t.fallback).length;
  const keptCount = plan ? plan.tasks.filter((t) => t.assign === 'claude').length : 0;
  const cloud = stats ? stats.tasksCloud : list.filter((t) => t.fallback).length + keptCount;
  const npu = stats ? stats.npuTasks : list.filter((t) => t.state === 'completed' && !t.fallback && t.runtime === 'npu').length;
  const saved = stats ? stats.cloudTokensSaved : list.filter((t) => t.state === 'completed' && !t.fallback).reduce((s, t) => s + (t.tokensOut || 0), 0);
  const elapsed = useElapsed(session?.startedAt, session && !session.completed);
  const Item = ({ label, value, color }) => (
    <div className="flex flex-col items-center px-3">
      <span className="text-xl md:text-2xl font-bold tabular" style={color ? { color } : undefined}>{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-faint">{label}</span>
    </div>
  );
  return (
    <div className="sticky bottom-0 mt-3 bg-surface-2 border border-border rounded-2xl py-3 flex items-center justify-around">
      <Item label="On device" value={onDevice} color="var(--ok)" />
      <Item label="Cloud" value={cloud} color="var(--claude)" />
      <Item label="NPU tasks" value={npu} color="var(--accent)" />
      <Item label="Tokens saved" value={saved} color="var(--accent-2)" />
      <Item label={session?.completed ? 'Total' : 'Elapsed'} value={session?.completed ? (stats ? (stats.wallClockMs / 1000).toFixed(1) + 's' : elapsed) : elapsed} />
    </div>
  );
}

export default function Orchestration() {
  const s = useStore();
  const phoneTasks = Object.values(s.tasks);
  return (
    <div className="flex flex-col gap-3 pb-2">
      {s.session && (
        <div className="text-sm text-dim">
          <span className="text-faint">session:</span> {s.session.prompt || '(unnamed)'}{' '}
          {s.session.completed && <span style={{ color: 'var(--ok)' }}>· done</span>}
        </div>
      )}
      <ReasoningFeed reasoning={s.reasoning} />
      <PlanColumns plan={s.plan} />
      {phoneTasks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {phoneTasks.map((t) => (
            <TaskCard key={t.taskId} task={t} output={s.outputs[t.taskId]} />
          ))}
        </div>
      )}
      {(s.session || phoneTasks.length > 0) && <Scoreboard tasks={s.tasks} plan={s.plan} stats={s.stats} session={s.session} />}
      {!s.session && phoneTasks.length === 0 && (
        <Card className="text-center text-dim py-10">
          No active session. Run <span className="font-mono text-text">/sisyphus &lt;prompt&gt;</span> in the demo project.
        </Card>
      )}
    </div>
  );
}
