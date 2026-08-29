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
  ['vitals', 'Phone vitals'],
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
      <header className="sticky top-0 z-10 bg-bg border-b border-border">
        <div className="px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-baseline gap-3.5">
            <span className="pixel text-[22px] text-text">SISYPHUS</span>
            <span className="text-[10px] tracking-[0.14em] text-faint hidden sm:inline">
              Edge compute for coding agents
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] tracking-[0.12em] text-faint">
            <StatusDot online={s.connected} />
            {s.connected ? 'Live' : 'Reconnecting'} · {String(online).padStart(2, '0')} phone{online === 1 ? '' : 's'}
          </div>
        </div>
        <nav className="flex border-t border-border overflow-x-auto">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="flex-1 px-4 py-2.5 text-[11px] tracking-[0.12em] whitespace-nowrap border-r border-border transition-colors"
              style={
                tab === key
                  ? { background: 'var(--paper)', color: 'var(--ink)' }
                  : { color: 'var(--text-faint)' }
              }
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="max-w-[1240px] mx-auto px-6 py-6">
        {tab === 'orchestration' && <Orchestration />}
        {tab === 'vitals' && <Vitals />}
        {tab === 'configure' && <Configure />}
        {tab === 'history' && <History />}
      </main>
    </div>
  );
}
