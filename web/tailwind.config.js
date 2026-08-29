/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        paper: 'var(--paper)',
        'paper-border': 'var(--paper-border)',
        ink: 'var(--ink)',
        border: 'var(--border)',
        'border-soft': 'var(--border-soft)',
        text: 'var(--text)',
        dim: 'var(--text-dim)',
        faint: 'var(--text-faint)',
        signal: 'var(--signal)',
        // legacy keys
        accent: 'var(--accent)',
        accent2: 'var(--accent-2)',
        claude: 'var(--claude)',
        ok: 'var(--ok)',
        warn: 'var(--warn)',
        err: 'var(--err)',
        cpu: 'var(--cpu)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'ui-monospace', 'Cascadia Code', 'Consolas', 'monospace'],
        pixel: ['Silkscreen', 'monospace'],
      },
    },
  },
  plugins: [],
};
