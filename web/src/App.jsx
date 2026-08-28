import { useState } from 'react';
import { useStore } from './store.js';
import { StatusDot } from './components/ui.jsx';
import Configure from './tabs/Configure.jsx';
import Orchestration from './tabs/Orchestration.jsx';
import Vitals from './tabs/Vitals.jsx';
import History from './tabs/History.jsx';
import WorkerView from './WorkerView.jsx';

const TABS = [
  ['orchestration', 'Orchestration'],
  ['vitals', 'Phone Vitals'],
  ['configure', 'Configure'],
  ['history', 'History'],
];

export default function App() {
  // Simple path routing — worker view is a separate full-screen surface.
  const path = location.pathname;
  const workerMatch = path.match(/^\/worker\/([^/]+)/);
  if (workerMatch) return <WorkerView phoneId={workerMatch[1]} />;

  const s = useStore();
  const [tab, setTab] = useState('orchestration');
  const online = s.phones.filter((p) => p.status === 'online').length;

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 bg-bg/90 backdrop-blur border-b border-border">
        <div className="max-w-[1100px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
              SISYPHUS
            </span>
            <span className="text-xs text-faint hidden sm:inline">edge compute for coding agents</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-dim">
            <StatusDot online={s.connected} />
            {s.connected ? 'live' : 'reconnecting'} · {online} phone{online === 1 ? '' : 's'}
          </div>
        </div>
        <nav className="max-w-[1100px] mx-auto px-2 flex gap-1 overflow-x-auto">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors"
              style={{
                borderColor: tab === key ? 'var(--accent)' : 'transparent',
                color: tab === key ? 'var(--text)' : 'var(--text-dim)',
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="max-w-[1100px] mx-auto px-4 py-4">
        {tab === 'orchestration' && <Orchestration />}
        {tab === 'vitals' && <Vitals />}
        {tab === 'configure' && <Configure />}
        {tab === 'history' && <History />}
      </main>
    </div>
  );
}
