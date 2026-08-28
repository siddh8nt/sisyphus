// Habit Tracker — a small, working Express app. The Sisyphus demo adds a
// streak-statistics feature on top of this.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

const __dirname = import.meta.dirname;
const DATA = path.join(__dirname, 'habits.json');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function load() {
  return JSON.parse(fs.readFileSync(DATA, 'utf8'));
}
function save(habits) {
  fs.writeFileSync(DATA, JSON.stringify(habits, null, 2));
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

app.get('/api/habits', (_req, res) => {
  res.json(load());
});

// Toggle today's completion for a habit.
app.post('/api/habits/:id/toggle', (req, res) => {
  const habits = load();
  const h = habits.find((x) => x.id === req.params.id);
  if (!h) return res.status(404).json({ error: 'not found' });
  const d = today();
  const i = h.completions.indexOf(d);
  if (i >= 0) h.completions.splice(i, 1);
  else h.completions.push(d);
  h.completions.sort();
  save(habits);
  res.json(h);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Habit Tracker on http://localhost:${PORT}`));
