import { useEffect, useState } from 'react';
import { useStore } from '../store.js';
import { Card, RuntimeBadge } from '../components/ui.jsx';

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
    <Card>
      <button className="w-full text-left" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium truncate">{session.prompt || '(unnamed session)'}</div>
            <div className="text-xs text-faint">{fmtDate(session.started_at)}{session.completed_at ? '' : ' · running'}</div>
          </div>
          <div className="text-right text-xs text-dim shrink-0 tabular">
            {st ? (
              <>
                <div>{st.tasksOnDevice} on-device · {st.tasksCloud} cloud</div>
                <div style={{ color: 'var(--accent-2)' }}>{st.cloudTokensSaved} tok saved</div>
              </>
            ) : (
              <span className="text-faint">—</span>
            )}
          </div>
        </div>
      </button>
      {open && detail && (
        <div className="mt-3 border-t border-border pt-3">
          <table className="w-full text-xs">
            <thead className="text-faint uppercase text-[10px]">
              <tr>
                <th className="text-left font-normal pb-1">Task</th>
                <th className="text-left font-normal pb-1">Who</th>
                <th className="text-right font-normal pb-1">Tokens</th>
                <th className="text-right font-normal pb-1">Result</th>
              </tr>
            </thead>
            <tbody>
              {detail.tasks.map((t) => (
                <tr key={t.id} className="border-t border-border/50">
                  <td className="py-1 pr-2">{t.title}</td>
                  <td className="py-1 pr-2">
                    <span className="inline-flex items-center gap-1">
                      {t.fallback ? 'Claude' : t.phone_name || '—'}
                      {!t.fallback && <RuntimeBadge runtime={t.runtime} />}
                    </span>
                  </td>
                  <td className="py-1 text-right tabular">{t.tokens_out || 0}</td>
                  <td className="py-1 text-right" style={{ color: t.status === 'completed' && !t.fallback ? 'var(--ok)' : 'var(--claude)' }}>
                    {t.fallback ? 'cloud' : t.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
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

  if (!sessions) return <Card className="text-center text-dim py-10">Loading…</Card>;
  if (!sessions.length) return <Card className="text-center text-dim py-10">No sessions yet.</Card>;
  return (
    <div className="flex flex-col gap-3">
      {sessions.map((sess) => (
        <SessionRow key={sess.id} session={sess} />
      ))}
    </div>
  );
}
