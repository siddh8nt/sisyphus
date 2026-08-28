// Habit Tracker front-end. Loads habits and toggles today's completion.
const today = new Date().toISOString().slice(0, 10);
document.getElementById('today').textContent = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

async function load() {
  const habits = await (await fetch('/api/habits')).json();
  render(habits);
}

function render(habits) {
  const ul = document.getElementById('habits');
  ul.innerHTML = '';
  for (const h of habits) {
    const doneToday = h.completions.includes(today);
    const li = document.createElement('li');
    li.className = 'habit' + (doneToday ? ' done' : '');
    li.innerHTML = `
      <span class="emoji">${h.emoji}</span>
      <span class="name">${h.name}</span>
      <span class="count">${h.completions.length}×</span>
      <span class="check">${doneToday ? '✓' : ''}</span>`;
    li.addEventListener('click', () => toggle(h.id));
    ul.appendChild(li);
  }
}

async function toggle(id) {
  await fetch(`/api/habits/${id}/toggle`, { method: 'POST' });
  load();
}

load();
