/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        border: 'var(--border)',
        text: 'var(--text)',
        dim: 'var(--text-dim)',
        faint: 'var(--text-faint)',
        accent: 'var(--accent)',
        accent2: 'var(--accent-2)',
        claude: 'var(--claude)',
        ok: 'var(--ok)',
        warn: 'var(--warn)',
        err: 'var(--err)',
        cpu: 'var(--cpu)',
      },
      fontFamily: {
        mono: ['ui-monospace', 'JetBrains Mono', 'Cascadia Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
