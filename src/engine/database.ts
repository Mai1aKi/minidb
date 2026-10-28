// Storage + executor: runs AST statements against in-memory tables.
// Tables serialize to plain JSON so the UI can persist them in localStorage.

import type { Expr, Statement } from '../sql/ast';
import { Parser } from '../sql/parser';
import { tokenize } from '../sql/tokenizer';
import { MiniDbError } from './errors';
import type { ColumnType, ExecResult, Row, Table, TableInfo, Value } from './types';

interface SerializedDb {
  version: 1;
  tables: Table[];
}

export class Database {
  private tables = new Map<string, Table>();

  /** Execute exactly one SQL statement. */
  execute(sql: string): ExecResult {
    const stmt = new Parser(tokenize(sql)).parseStatement();
    return this.run(stmt);
  }

  /**
   * Execute a script of several ';'-separated statements.
   * Statements run in order; the first error stops the script and
   * the results gathered so far are returned alongside the error.
   */
  executeScript(script: string): { results: ExecResult[]; error: MiniDbError | null } {
    const tokens = tokenize(script);
    const chunks: (typeof tokens)[] = [];
    let current: typeof tokens = [];
    for (const tok of tokens) {
      if (tok.type === 'eof') break;
      if (tok.type === 'symbol' && tok.value === ';') {
        chunks.push(current);
        current = [];
      } else {
        current.push(tok);
      }
    }
    if (current.length > 0) chunks.push(current);

    const results: ExecResult[] = [];
    for (const chunk of chunks) {
      if (chunk.length === 0) continue;
      try {
        const stmt = new Parser([...chunk, { type: 'eof', value: '', pos: chunk[chunk.length - 1].pos + 1 }]).parseStatement();
        results.push(this.run(stmt));
      } catch (e) {
        return { results, error: e instanceof MiniDbError ? e : new MiniDbError(String(e)) };
      }
    }
    return { results, error: null };
  }

  listTables(): TableInfo[] {
    return [...this.tables.values()].map((t) => ({
      name: t.name,
      columns: t.columns,
      rowCount: t.rows.length,
    }));
  }

  toJSON(): string {
    const data: SerializedDb = { version: 1, tables: [...this.tables.values()] };
    return JSON.stringify(data);
  }

  static fromJSON(json: string): Database {
    const db = new Database();
    try {
      const data = JSON.parse(json) as SerializedDb;
      if (data.version !== 1 || !Array.isArray(data.tables)) return db;
      for (const table of data.tables) {
        db.tables.set(table.name, table);
      }
    } catch {
      // Corrupt saved state: start empty rather than crash the console.
    }
    return db;
  }

  // ---------- statement execution ----------

  private run(stmt: Statement): ExecResult {
    switch (stmt.type) {
      case 'createTable':
        return this.runCreate(stmt);
      case 'insert':
        return this.runInsert(stmt);
      case 'select':
        return this.runSelect(stmt);
      case 'dropTable':
        return this.runDrop(stmt);
    }
  }

  private getTable(name: string): Table {
    const table = this.tables.get(name);
    if (!table) throw new MiniDbError(`Table "${name}" does not exist`);
    return table;
  }

  private runCreate(stmt: Extract<Statement, { type: 'createTable' }>): ExecResult {
    if (this.tables.has(stmt.table)) {
      throw new MiniDbError(`Table "${stmt.table}" already exists`);
    }
    this.tables.set(stmt.table, { name: stmt.table, columns: stmt.columns, rows: [] });
    return {
      kind: 'ok',
      message: `Table "${stmt.table}" created (${stmt.columns.length} columns)`,
      plan: `Create Table on ${stmt.table}`,
      affected: 0,
      scanned: 0,
    };
  }

  private runDrop(stmt: Extract<Statement, { type: 'dropTable' }>): ExecResult {
    const table = this.getTable(stmt.table);
    this.tables.delete(stmt.table);
    return {
      kind: 'ok',
      message: `Table "${stmt.table}" dropped (${table.rows.length} rows discarded)`,
      plan: `Drop Table on ${stmt.table}`,
      affected: 0,
      scanned: 0,
    };
  }

  private runInsert(stmt: Extract<Statement, { type: 'insert' }>): ExecResult {
    const table = this.getTable(stmt.table);
    const targetColumns = stmt.columns ?? table.columns.map((c) => c.name);
    for (const name of targetColumns) {
      if (!table.columns.some((c) => c.name === name)) {
        throw new MiniDbError(`Column "${name}" does not exist on table "${table.name}"`);
      }
    }
    let inserted = 0;
    for (const tuple of stmt.values) {
      if (tuple.length !== targetColumns.length) {
        throw new MiniDbError(
          `INSERT expects ${targetColumns.length} values per row, got ${tuple.length}`,
        );
      }
      const row: Row = {};
      for (const col of table.columns) row[col.name] = null;
      tuple.forEach((value, idx) => {
        const colName = targetColumns[idx];
        const col = table.columns.find((c) => c.name === colName)!;
        row[colName] = coerceValue(value, col.type, colName);
      });
      table.rows.push(row);
      inserted++;
    }
    return {
      kind: 'ok',
      message: `Inserted ${inserted} row${inserted === 1 ? '' : 's'} into "${table.name}"`,
      plan: `Insert on ${table.name}`,
      affected: inserted,
      scanned: 0,
    };
  }

  private runSelect(stmt: Extract<Statement, { type: 'select' }>): ExecResult {
    const table = this.getTable(stmt.table);
    const scanned = table.rows.length;

    const outColumns =
      stmt.columns === '*' ? table.columns.map((c) => c.name) : stmt.columns;
    for (const name of outColumns) {
      if (!table.columns.some((c) => c.name === name)) {
        throw new MiniDbError(`Column "${name}" does not exist on table "${table.name}"`);
      }
    }

    let matched = table.rows.filter((row) => {
      if (!stmt.where) return true;
      return truthy(this.evalExpr(stmt.where, table, row));
    });

    if (stmt.orderBy) {
      const { column, dir } = stmt.orderBy;
      if (!table.columns.some((c) => c.name === column)) {
        throw new MiniDbError(`Column "${column}" does not exist on table "${table.name}"`);
      }
      const sign = dir === 'DESC' ? -1 : 1;
      matched = [...matched].sort((a, b) => sign * compareForSort(a[column], b[column]));
    }

    if (stmt.limit !== null) {
      matched = matched.slice(0, stmt.limit);
    }

    return {
      kind: 'rows',
      columns: outColumns,
      rows: matched.map((row) => outColumns.map((c) => row[c])),
      plan: `Seq Scan on ${table.name}`,
      affected: matched.length,
      scanned,
    };
  }

  // ---------- expression evaluation ----------

  private evalExpr(expr: Expr, table: Table, row: Row): Value {
    switch (expr.type) {
      case 'literal':
        return expr.value;
      case 'column': {
        if (!table.columns.some((c) => c.name === expr.name)) {
          throw new MiniDbError(`Column "${expr.name}" does not exist on table "${table.name}"`);
        }
        return row[expr.name];
      }
      case 'not':
        return !truthy(this.evalExpr(expr.expr, table, row));
      case 'logic': {
        const left = truthy(this.evalExpr(expr.left, table, row));
        if (expr.op === 'AND') {
          return left && truthy(this.evalExpr(expr.right, table, row));
        }
        return left || truthy(this.evalExpr(expr.right, table, row));
      }
      case 'binary': {
        const left = this.evalExpr(expr.left, table, row);
        const right = this.evalExpr(expr.right, table, row);
        return compareValues(expr.op, left, right);
      }
    }
  }
}

// ---------- value helpers ----------

function truthy(v: Value): boolean {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return v.length > 0;
}

function typeName(v: Value): string {
  if (v === null) return 'NULL';
  if (typeof v === 'number') return Number.isInteger(v) ? 'INT' : 'FLOAT';
  if (typeof v === 'boolean') return 'BOOL';
  return 'TEXT';
}

/** Check (and lightly coerce) a literal against a declared column type. */
export function coerceValue(value: Value, type: ColumnType, column: string): Value {
  if (value === null) return null;
  switch (type) {
    case 'INT':
      if (typeof value === 'number' && Number.isInteger(value)) return value;
      break;
    case 'FLOAT':
      if (typeof value === 'number') return value;
      break;
    case 'TEXT':
      if (typeof value === 'string') return value;
      break;
    case 'BOOL':
      if (typeof value === 'boolean') return value;
      break;
  }
  throw new MiniDbError(
    `Type error: column "${column}" expects ${type}, got ${typeName(value)} (${JSON.stringify(value)})`,
  );
}

function compareValues(op: string, left: Value, right: Value): boolean {
  // SQL-flavoured rule: any comparison involving NULL is not true.
  if (left === null || right === null) return false;
  if (typeof left !== typeof right) {
    throw new MiniDbError(`Cannot compare ${typeName(left)} with ${typeName(right)}`);
  }
  switch (op) {
    case '=':
      return left === right;
    case '!=':
      return left !== right;
    case '<':
      return (left as number) < (right as number);
    case '<=':
      return (left as number) <= (right as number);
    case '>':
      return (left as number) > (right as number);
    case '>=':
      return (left as number) >= (right as number);
    default:
      throw new MiniDbError(`Unknown operator "${op}"`);
  }
}

function compareForSort(a: Value, b: Value): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // NULLs last
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b));
}
