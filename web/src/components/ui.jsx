import { useState } from 'react';

export function Card({ className = '', children, ...rest }) {
  return (
    <div className={`bg-bg border border-border p-4 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function StatusDot({ online, className = '' }) {
  return <span className={`${online ? 'square-live' : 'square-off'} ${className}`} />;
}

export function RuntimeBadge({ runtime }) {
  if (!runtime) return null;
  const npu = runtime === 'npu';
  return (
    <span
      className="chip text-[9px] font-medium px-1.5 py-0.5"
      style={
        npu
          ? { background: 'var(--text)', color: 'var(--ink)', border: '1px solid var(--text)' }
          : { border: '1px solid var(--border)', color: 'var(--text-faint)' }
      }
    >
      {npu ? 'NPU' : 'CPU'}
    </span>
  );
}

// Monochrome state glyphs — state is shown by glyph, not color.
const STATE_GLYPH = {
  planned: ['○', 'var(--text-faint)'],
  awaiting_approval: ['◇', 'var(--text-faint)'],
  queued: ['○', 'var(--text-faint)'],
  dispatched: ['●', 'var(--signal)'],
  generating: ['●', 'var(--signal)'],
  validating: ['△', 'var(--text-faint)'],
  testing: ['△', 'var(--signal)'],
  retrying: ['△', 'var(--text-faint)'],
  completed: ['■', 'var(--text)'],
  failed: ['✕', 'var(--text-faint)'],
  fallback_claude: ['✕', 'var(--text-faint)'],
  claude_working: ['□', 'var(--text-dim)'],
};

export function StateChip({ state }) {
  const [glyph, color] = STATE_GLYPH[state] || ['○', 'var(--text-dim)'];
  const label = (state || '').replace('_', ' ');
  return (
    <span className="chip text-[9px] inline-flex items-baseline gap-1.5" style={{ color: 'var(--text-faint)' }}>
      <span style={{ color }}>{glyph}</span>
      {label}
    </span>
  );
}

export function Stat({ label, value, sub, color }) {
  return (
    <div className="flex flex-col">
      <span className="micro">{label}</span>
      <span className="pixel text-2xl tabular" style={color ? { color } : undefined}>
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
      className="text-[10px] tracking-[0.12em] px-3 py-1.5 border border-border text-text hover:border-text transition-colors"
    >
      {done ? '■ Copied' : label}
    </button>
  );
}

// Discrete vertical bars on the paper canvas — the last bar is the signal.
export function Sparkline({ data = [], width = 160, height = 36 }) {
  if (!data.length) return <svg width={width} height={height} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const n = data.length;
  const barW = 4;
  const step = n > 1 ? (width - barW) / (n - 1) : 0;
  return (
    <svg width={width} height={height} className="block">
      {data.map((v, i) => {
        const h = Math.max(3, ((v - min) / span) * (height - 4));
        return (
          <rect
            key={i}
            x={(i * step).toFixed(1)}
            y={(height - h).toFixed(1)}
            width={barW}
            height={h.toFixed(1)}
            fill={i === n - 1 ? 'var(--signal)' : 'var(--ink)'}
          />
        );
      })}
    </svg>
  );
}
