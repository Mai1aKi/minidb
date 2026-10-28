// Abstract syntax tree nodes produced by the parser.

import type { ColumnType, Value } from '../engine/types';

export type Expr =
  | { type: 'literal'; value: Value }
  | { type: 'column'; name: string }
  | { type: 'binary'; op: string; left: Expr; right: Expr }
  | { type: 'logic'; op: 'AND' | 'OR'; left: Expr; right: Expr }
  | { type: 'not'; expr: Expr };

export type Statement =
  | {
      type: 'createTable';
      table: string;
      columns: { name: string; type: ColumnType }[];
    }
  | {
      type: 'insert';
      table: string;
      columns: string[] | null;
      values: Value[][];
    }
  | {
      type: 'select';
      columns: string[] | '*';
      table: string;
      where: Expr | null;
      orderBy: { column: string; dir: 'ASC' | 'DESC' } | null;
      limit: number | null;
    }
  | { type: 'dropTable'; table: string };
