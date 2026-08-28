import { useState } from 'react';

export function Card({ className = '', children, ...rest }) {
  return (
    <div className={`bg-surface border border-border rounded-2xl p-4 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function StatusDot({ online, className = '' }) {
  const color = online ? 'var(--ok)' : 'var(--err)';
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${online ? 'pulse' : ''} ${className}`}
      style={{ background: color, color }}
    />
  );
}

export function RuntimeBadge({ runtime }) {
  if (!runtime) return null;
  const npu = runtime === 'npu';
  return (
    <span
      className="chip text-[10px] font-bold px-1.5 py-0.5 rounded"
      style={
        npu
          ? { background: 'var(--accent)', color: '#0a0b0f' }
          : { border: '1px solid var(--cpu)', color: 'var(--cpu)' }
      }
    >
      {npu ? 'NPU' : 'CPU'}
    </span>
  );
}

const STATE_COLOR = {
  planned: 'var(--text-faint)',
  queued: 'var(--text-faint)',
  dispatched: 'var(--accent-2)',
  generating: 'var(--accent-2)',
  validating: 'var(--warn)',
  retrying: 'var(--warn)',
  completed: 'var(--ok)',
  failed: 'var(--err)',
  fallback_claude: 'var(--err)',
  claude_working: 'var(--claude)',
};

export function StateChip({ state }) {
  const c = STATE_COLOR[state] || 'var(--text-dim)';
  const label = (state || '').replace('_', ' ');
  return (
    <span
      className="chip text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ color: c, border: `1px solid ${c}`, background: `color-mix(in srgb, ${c} 12%, transparent)` }}
    >
      {label}
    </span>
  );
}

export function Stat({ label, value, sub, color }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-faint">{label}</span>
      <span className="text-2xl font-semibold tabular" style={color ? { color } : undefined}>
        {value}
      </span>
      {sub && <span className="text-xs text-dim tabular">{sub}</span>}
    </div>
  );
}

export function CopyButton({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="text-xs px-2 py-1 rounded border border-border text-dim hover:text-text hover:border-accent transition-colors"
    >
      {done ? '✓ Copied' : label}
    </button>
  );
}

// Hand-rolled SVG sparkline (no chart lib).
export function Sparkline({ data = [], width = 160, height = 36, color = 'var(--accent-2)' }) {
  if (!data.length) return <svg width={width} height={height} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = width / Math.max(1, data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * (height - 4) - 2).toFixed(1)}`);
  return (
    <svg width={width} height={height} className="block">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
