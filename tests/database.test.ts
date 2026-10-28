import { describe, expect, it } from 'vitest';
import { Database } from '../src/engine/database';

function seedDb(): Database {
  const db = new Database();
  db.execute('CREATE TABLE users (id INT, name TEXT, age INT, city TEXT)');
  db.execute(
    "INSERT INTO users VALUES (1, 'Alice', 31, 'NYC'), (2, 'Bob', 24, 'SEA'), (3, 'Chen', 28, 'NYC')",
  );
  return db;
}

describe('database executor', () => {
  it('creates tables and lists them', () => {
    const db = seedDb();
    const tables = db.listTables();
    expect(tables).toHaveLength(1);
    expect(tables[0]).toMatchObject({ name: 'users', rowCount: 3 });
  });

  it('SELECT * returns all rows with a Seq Scan plan', () => {
    const db = seedDb();
    const result = db.execute('SELECT * FROM users');
    expect(result.kind).toBe('rows');
    if (result.kind !== 'rows') throw new Error('unreachable');
    expect(result.columns).toEqual(['id', 'name', 'age', 'city']);
    expect(result.rows).toHaveLength(3);
    expect(result.plan).toBe('Seq Scan on users');
    expect(result.scanned).toBe(3);
  });

  it('filters with WHERE, AND and comparisons', () => {
    const db = seedDb();
    const result = db.execute("SELECT name FROM users WHERE age >= 28 AND city = 'NYC'");
    if (result.kind !== 'rows') throw new Error('unreachable');
    expect(result.rows).toEqual([['Alice'], ['Chen']]);
  });

  it('supports OR and parentheses', () => {
    const db = seedDb();
    const result = db.execute(
      "SELECT id FROM users WHERE (city = 'SEA' OR age > 30) AND id != 3 ORDER BY id",
    );
    if (result.kind !== 'rows') throw new Error('unreachable');
    expect(result.rows).toEqual([[1], [2]]);
  });

  it('orders and limits', () => {
    const db = seedDb();
    const result = db.execute('SELECT name, age FROM users ORDER BY age DESC LIMIT 2');
    if (result.kind !== 'rows') throw new Error('unreachable');
    expect(result.rows).toEqual([
      ['Alice', 31],
      ['Chen', 28],
    ]);
  });

  it('fills unspecified INSERT columns with NULL', () => {
    const db = seedDb();
    db.execute("INSERT INTO users (id, name) VALUES (4, 'Yuki')");
    const result = db.execute('SELECT age, city FROM users WHERE id = 4');
    if (result.kind !== 'rows') throw new Error('unreachable');
    expect(result.rows).toEqual([[null, null]]);
  });

  it('enforces column types on INSERT', () => {
    const db = seedDb();
    expect(() => db.execute("INSERT INTO users VALUES (5, 'Eve', 'young', 'LA')")).toThrowError(
      /expects INT/,
    );
  });

  it('errors on unknown tables and columns', () => {
    const db = seedDb();
    expect(() => db.execute('SELECT * FROM ghosts')).toThrowError(/does not exist/);
    expect(() => db.execute('SELECT nickname FROM users')).toThrowError(/does not exist/);
    expect(() => db.execute('SELECT * FROM users WHERE nickname = 1')).toThrowError(/does not exist/);
  });

  it('errors when comparing mismatched types in WHERE', () => {
    const db = seedDb();
    expect(() => db.execute("SELECT * FROM users WHERE age = 'old'")).toThrowError(/Cannot compare/);
  });

  it('drops tables', () => {
    const db = seedDb();
    db.execute('DROP TABLE users');
    expect(db.listTables()).toHaveLength(0);
    expect(() => db.execute('SELECT * FROM users')).toThrowError(/does not exist/);
  });

  it('round-trips through JSON serialization', () => {
    const db = seedDb();
    const restored = Database.fromJSON(db.toJSON());
    const result = restored.execute('SELECT * FROM users');
    if (result.kind !== 'rows') throw new Error('unreachable');
    expect(result.rows).toHaveLength(3);
  });

  it('executeScript runs several statements and stops at the first error', () => {
    const db = new Database();
    const ok = db.executeScript(
      'CREATE TABLE t (id INT); INSERT INTO t VALUES (1), (2); SELECT * FROM t;',
    );
    expect(ok.error).toBeNull();
    expect(ok.results).toHaveLength(3);

    const bad = db.executeScript('INSERT INTO t VALUES (3); SELECT * FROM missing; INSERT INTO t VALUES (4);');
    expect(bad.error).not.toBeNull();
    expect(bad.results).toHaveLength(1);
  });
});
