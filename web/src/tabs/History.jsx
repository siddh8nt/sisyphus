import { useEffect, useState } from 'react';
import { useStore } from '../store.js';
import { RuntimeBadge } from '../components/ui.jsx';

function fmtDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function SessionRow({ session }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    if (open && !detail) {
      fetch(`/api/sessions/${session.id}`)
        .then((r) => r.json())
        .then(setDetail)
        .catch(() => {});
    }
  }, [open]);
  const st = session.stats;
  return (
    <div className="border-b border-border-soft last:border-b-0">
      <button className="w-full text-left px-3 py-3" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-baseline gap-3">
            <span className="text-[12px] tracking-[0.04em] truncate">{session.prompt || '(unnamed session)'}</span>
            <span className="text-[10px] text-faint shrink-0">
              {fmtDate(session.started_at)}
              {session.completed_at ? '' : ' · running'}
            </span>
          </div>
          <div className="flex items-baseline gap-3.5 shrink-0 text-[10px] tabular">
            {st ? (
              <>
                <span className="text-faint">
                  {String(st.tasksOnDevice).padStart(2, '0')} on-device · {String(st.tasksCloud).padStart(2, '0')} cloud
                </span>
                <span>{st.cloudTokensSaved} tok saved</span>
              </>
            ) : (
              <span className="text-faint">—</span>
            )}
            <span className="text-faint">{open ? '▲' : '▼'}</span>
          </div>
        </div>
      </button>
      {open && detail && (
        <div className="border-t border-border-soft bg-surface">
          <div className="grid grid-cols-[2fr_1fr_100px_100px] px-3 py-1.5 text-[9px] tracking-[0.14em] uppercase text-faint border-b border-border-soft">
            <span>Task</span>
            <span>Who</span>
            <span className="text-right">Tokens</span>
            <span className="text-right">Result</span>
          </div>
          {detail.tasks.map((t) => (
            <div key={t.id} className="grid grid-cols-[2fr_1fr_100px_100px] px-3 py-1.5 text-[11px] border-b border-border-soft last:border-b-0">
              <span>{t.title}</span>
              <span className="inline-flex items-baseline gap-1.5">
                {t.fallback ? 'Claude' : t.phone_name || '—'}
                {!t.fallback && <RuntimeBadge runtime={t.runtime} />}
              </span>
              <span className="text-right tabular">{t.tokens_out || 0}</span>
              <span className="text-right" style={{ color: t.status === 'completed' && !t.fallback ? 'var(--text)' : 'var(--text-faint)' }}>
                {t.fallback ? 'cloud' : t.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function History() {
  const s = useStore();
  const [sessions, setSessions] = useState(null);
  const refresh = () =>
    fetch('/api/sessions')
      .then((r) => r.json())
      .then(setSessions)
      .catch(() => setSessions([]));
  useEffect(() => {
    refresh();
  }, []);
  // Re-fetch when a session completes live.
  useEffect(() => {
    if (s.stats) refresh();
  }, [s.stats]);

  if (!sessions) return <div className="module text-center text-faint py-16 text-[11px]">Loading…</div>;
  if (!sessions.length) {
    return (
      <div className="module dotfield text-center py-24 flex flex-col items-center gap-4">
        <div className="pixel text-[46px] text-text">(NO RECORD)</div>
        <div className="text-[11px] tracking-[0.18em] text-faint">00 sessions logged</div>
      </div>
    );
  }
  return (
    <div className="module">
      <div className="px-3 py-2 border-b border-border text-[10px] tracking-[0.14em] uppercase text-faint">Sessions</div>
      {sessions.map((sess) => (
        <SessionRow key={sess.id} session={sess} />
      ))}
    </div>
  );
}
