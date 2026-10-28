// Core value and storage types for the MiniDB engine.

export type Value = number | string | boolean | null;

export type ColumnType = 'INT' | 'FLOAT' | 'TEXT' | 'BOOL';

export interface ColumnDef {
  name: string;
  type: ColumnType;
}

export type Row = Record<string, Value>;

export interface Table {
  name: string;
  columns: ColumnDef[];
  rows: Row[];
}

export interface TableInfo {
  name: string;
  columns: ColumnDef[];
  rowCount: number;
}

/** What one executed statement reports back to the console UI. */
export type ExecResult =
  | {
      kind: 'rows';
      columns: string[];
      rows: Value[][];
      /** Human-readable execution plan, e.g. "Seq Scan on users". */
      plan: string;
      /** Rows returned to the client. */
      affected: number;
      /** Rows the executor had to look at. */
      scanned: number;
    }
  | {
      kind: 'ok';
      message: string;
      plan: string;
      affected: number;
      scanned: number;
    };
