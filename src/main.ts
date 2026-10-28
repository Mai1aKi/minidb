// MiniDB console: a small SQL workbench wired to the engine.
// State is persisted to localStorage after every successful script run.

import { Database } from './engine/database';
import type { ExecResult, Value } from './engine/types';
import './style.css';

const STORAGE_KEY = 'minidb-state-v1';

const SEED_SCRIPT = `-- MiniDB 示例数据
CREATE TABLE users (id INT, name TEXT, age INT, city TEXT);
INSERT INTO users VALUES
  (1, 'Alice', 31, 'New York'),
  (2, 'Bob', 24, 'Seattle'),
  (3, 'Chen Wei', 28, 'New York'),
  (4, 'Yuki', 35, 'Tokyo'),
  (5, 'Omar', 24, 'Chicago');
CREATE TABLE products (id INT, title TEXT, price FLOAT, in_stock BOOL);
INSERT INTO products VALUES
  (1, 'Mechanical Keyboard', 129.99, TRUE),
  (2, 'USB-C Cable', 12.50, TRUE),
  (3, 'Laptop Stand', 59.00, FALSE);`;

const SAMPLES: { label: string; sql: string }[] = [
  { label: '查看全部用户', sql: 'SELECT * FROM users;' },
  {
    label: 'WHERE + AND',
    sql: "SELECT name, age FROM users WHERE age >= 28 AND city = 'New York';",
  },
  {
    label: '排序 + LIMIT',
    sql: 'SELECT title, price FROM products ORDER BY price DESC LIMIT 2;',
  },
  {
    label: '插入一行',
    sql: "INSERT INTO users VALUES (6, 'Lena', 29, 'Berlin');\nSELECT * FROM users WHERE id = 6;",
  },
  {
    label: '建一张新表',
    sql: 'CREATE TABLE notes (id INT, body TEXT);\nINSERT INTO notes VALUES (1, \'hello, database\');\nSELECT * FROM notes;',
  },
];

const editor = document.getElementById('editor') as HTMLTextAreaElement;
const runBtn = document.getElementById('run-btn') as HTMLButtonElement;
const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const logEl = document.getElementById('log') as HTMLDivElement;
const resultEl = document.getElementById('result') as HTMLDivElement;
const schemaEl = document.getElementById('schema') as HTMLDivElement;
const samplesEl = document.getElementById('samples') as HTMLDivElement;

function loadDb(): { db: Database; fresh: boolean } {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const db = Database.fromJSON(saved);
    return { db, fresh: db.listTables().length === 0 };
  }
  return { db: new Database(), fresh: true };
}

let { db, fresh } = loadDb();
if (fresh) {
  db.executeScript(SEED_SCRIPT);
  persist();
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, db.toJSON());
  } catch {
    // Storage full/blocked: the console keeps working in-memory.
  }
}

function renderSchema(): void {
  const tables = db.listTables();
  if (tables.length === 0) {
    schemaEl.innerHTML = '<p class="schema-empty">还没有表。用 CREATE TABLE 建一张吧。</p>';
    return;
  }
  schemaEl.innerHTML = tables
    .map(
      (t) => `
      <div class="table-card">
        <div class="table-name">${escapeHtml(t.name)} <span class="row-count">${t.rowCount} 行</span></div>
        <ul class="col-list">
          ${t.columns.map((c) => `<li><span class="col-name">${escapeHtml(c.name)}</span><span class="col-type">${c.type}</span></li>`).join('')}
        </ul>
      </div>`,
    )
    .join('');
}

function renderResult(result: ExecResult): void {
  if (result.kind === 'ok') {
    resultEl.innerHTML = `<p class="ok-message">✓ ${escapeHtml(result.message)}</p>`;
    return;
  }
  if (result.rows.length === 0) {
    resultEl.innerHTML = '<p class="ok-message">（0 行结果）</p>';
    return;
  }
  const head = result.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  const body = result.rows
    .map(
      (row) =>
        `<tr>${row
          .map((v) =>
            v === null ? '<td class="null">NULL</td>' : `<td>${escapeHtml(formatValue(v))}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');
  resultEl.innerHTML = `<table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function runEditor(): void {
  const sql = editor.value;
  logEl.innerHTML = '';
  const started = performance.now();
  const { results, error } = db.executeScript(sql);
  const ms = Math.max(0.1, performance.now() - started);

  for (const r of results) {
    const line = document.createElement('div');
    line.className = 'log-line';
    line.textContent =
      r.kind === 'rows'
        ? `${r.plan} · 扫描 ${r.scanned} 行 · 返回 ${r.affected} 行`
        : `${r.plan} · ${r.message}`;
    logEl.appendChild(line);
  }

  if (error) {
    const line = document.createElement('div');
    line.className = 'log-line error';
    line.textContent = `✗ ${error.message}`;
    logEl.appendChild(line);
    statusEl.textContent = '执行出错';
    statusEl.className = 'status err';
    if (results.length > 0) renderResult(results[results.length - 1]);
    else resultEl.innerHTML = '';
  } else if (results.length > 0) {
    const last = results[results.length - 1];
    renderResult(last);
    statusEl.textContent = `完成 · ${results.length} 条语句 · ${ms.toFixed(1)} ms`;
    statusEl.className = 'status ok';
    persist();
  } else {
    statusEl.textContent = '没有可执行的语句';
    statusEl.className = 'status';
  }
  renderSchema();
}

function formatValue(v: Exclude<Value, null>): string {
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Sample query chips
for (const sample of SAMPLES) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  chip.textContent = sample.label;
  chip.addEventListener('click', () => {
    editor.value = sample.sql;
    runEditor();
  });
  samplesEl.appendChild(chip);
}

runBtn.addEventListener('click', runEditor);
editor.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    runEditor();
  }
});
resetBtn.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  db = new Database();
  db.executeScript(SEED_SCRIPT);
  persist();
  editor.value = SAMPLES[0].sql;
  runEditor();
});

// First paint
editor.value = SAMPLES[0].sql;
renderSchema();
runEditor();
