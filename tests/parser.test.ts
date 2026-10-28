import { describe, expect, it } from 'vitest';
import { parseSql } from '../src/sql/parser';

describe('parser', () => {
  it('parses CREATE TABLE', () => {
    const stmt = parseSql('CREATE TABLE users (id INT, name TEXT, score FLOAT, active BOOL)');
    expect(stmt).toEqual({
      type: 'createTable',
      table: 'users',
      columns: [
        { name: 'id', type: 'INT' },
        { name: 'name', type: 'TEXT' },
        { name: 'score', type: 'FLOAT' },
        { name: 'active', type: 'BOOL' },
      ],
    });
  });

  it('parses multi-row INSERT with an explicit column list', () => {
    const stmt = parseSql("INSERT INTO users (id, name) VALUES (1, 'Alice'), (2, 'Bob');");
    expect(stmt).toEqual({
      type: 'insert',
      table: 'users',
      columns: ['id', 'name'],
      values: [
        [1, 'Alice'],
        [2, 'Bob'],
      ],
    });
  });

  it('parses SELECT with WHERE / ORDER BY / LIMIT', () => {
    const stmt = parseSql(
      "SELECT name, age FROM users WHERE age >= 18 AND city = 'NYC' ORDER BY age DESC LIMIT 3",
    );
    expect(stmt.type).toBe('select');
    if (stmt.type !== 'select') throw new Error('unreachable');
    expect(stmt.columns).toEqual(['name', 'age']);
    expect(stmt.table).toBe('users');
    expect(stmt.where).toMatchObject({ type: 'logic', op: 'AND' });
    expect(stmt.orderBy).toEqual({ column: 'age', dir: 'DESC' });
    expect(stmt.limit).toBe(3);
  });

  it('AND binds tighter than OR', () => {
    const stmt = parseSql('SELECT * FROM t WHERE a = 1 OR b = 2 AND c = 3');
    if (stmt.type !== 'select' || !stmt.where) throw new Error('unreachable');
    expect(stmt.where).toMatchObject({
      type: 'logic',
      op: 'OR',
      right: { type: 'logic', op: 'AND' },
    });
  });

  it('parses DROP TABLE', () => {
    expect(parseSql('DROP TABLE users')).toEqual({ type: 'dropTable', table: 'users' });
  });

  it('rejects unknown statements', () => {
    expect(() => parseSql('GRANT ALL ON users')).toThrowError(/Expected CREATE, INSERT, SELECT or DROP/);
  });

  it('rejects duplicate columns in CREATE TABLE', () => {
    expect(() => parseSql('CREATE TABLE t (id INT, id TEXT)')).toThrowError(/Duplicate column/);
  });
});
