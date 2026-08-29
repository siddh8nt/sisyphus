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
          {task.fallback ? (
            <span>✕ fell back to Claude</span>
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
  const live = session && !session.completed;
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
        label={session?.completed ? 'Total' : 'Elapsed'}
        value={session?.completed ? (stats ? (stats.wallClockMs / 1000).toFixed(1) + 's' : elapsed) : elapsed}
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
      <ReasoningFeed reasoning={s.reasoning} />
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
