// Recursive-descent parser: token list -> AST.
// Grammar (Day 0):
//   statement := createTable | insert | select | dropTable [';']
//   expr      := orExpr
//   orExpr    := andExpr (OR andExpr)*
//   andExpr   := notExpr (AND notExpr)*
//   notExpr   := NOT notExpr | comparison
//   comparison:= primary (op primary)?
//   primary   := literal | column | '(' expr ')'

import { MiniDbError } from '../engine/errors';
import type { ColumnType, Value } from '../engine/types';
import type { Expr, Statement } from './ast';
import type { Token } from './tokenizer';
import { tokenize } from './tokenizer';

export class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  /** Parse exactly one statement; a single trailing ';' is allowed. */
  parseStatement(): Statement {
    let stmt: Statement;
    if (this.atKeyword('CREATE')) stmt = this.parseCreateTable();
    else if (this.atKeyword('INSERT')) stmt = this.parseInsert();
    else if (this.atKeyword('SELECT')) stmt = this.parseSelect();
    else if (this.atKeyword('DROP')) stmt = this.parseDropTable();
    else {
      const t = this.peek();
      throw new MiniDbError(
        `Expected CREATE, INSERT, SELECT or DROP at position ${t.pos}, got '${t.value || 'end of input'}'`,
      );
    }
    if (this.atSymbol(';')) this.advance();
    const tail = this.peek();
    if (tail.type !== 'eof') {
      throw new MiniDbError(`Unexpected trailing input '${tail.value}' at position ${tail.pos}`);
    }
    return stmt;
  }

  // ---------- statements ----------

  private parseCreateTable(): Statement {
    this.expectKeyword('CREATE');
    this.expectKeyword('TABLE');
    const table = this.expectIdent('table name');
    this.expectSymbol('(');
    const columns: { name: string; type: ColumnType }[] = [];
    const seen = new Set<string>();
    do {
      const name = this.expectIdent('column name');
      if (seen.has(name)) throw new MiniDbError(`Duplicate column "${name}"`);
      seen.add(name);
      columns.push({ name, type: this.parseColumnType() });
    } while (this.eatSymbol(','));
    this.expectSymbol(')');
    return { type: 'createTable', table, columns };
  }

  private parseColumnType(): ColumnType {
    const t = this.peek();
    if (
      t.type === 'keyword' &&
      (t.value === 'INT' || t.value === 'FLOAT' || t.value === 'TEXT' || t.value === 'BOOL')
    ) {
      this.advance();
      return t.value as ColumnType;
    }
    throw new MiniDbError(`Expected a column type (INT, FLOAT, TEXT, BOOL) at position ${t.pos}`);
  }

  private parseInsert(): Statement {
    this.expectKeyword('INSERT');
    this.expectKeyword('INTO');
    const table = this.expectIdent('table name');
    let columns: string[] | null = null;
    if (this.atSymbol('(')) {
      this.advance();
      columns = [];
      do {
        columns.push(this.expectIdent('column name'));
      } while (this.eatSymbol(','));
      this.expectSymbol(')');
    }
    this.expectKeyword('VALUES');
    const values: Value[][] = [];
    do {
      this.expectSymbol('(');
      const tuple: Value[] = [];
      do {
        tuple.push(this.parseLiteral());
      } while (this.eatSymbol(','));
      this.expectSymbol(')');
      values.push(tuple);
    } while (this.eatSymbol(','));
    return { type: 'insert', table, columns, values };
  }

  private parseSelect(): Statement {
    this.expectKeyword('SELECT');
    let columns: string[] | '*';
    if (this.atSymbol('*')) {
      this.advance();
      columns = '*';
    } else {
      columns = [];
      do {
        columns.push(this.expectIdent('column name'));
      } while (this.eatSymbol(','));
    }
    this.expectKeyword('FROM');
    const table = this.expectIdent('table name');

    let where: Expr | null = null;
    if (this.atKeyword('WHERE')) {
      this.advance();
      where = this.parseExpr();
    }

    let orderBy: { column: string; dir: 'ASC' | 'DESC' } | null = null;
    if (this.atKeyword('ORDER')) {
      this.advance();
      this.expectKeyword('BY');
      const column = this.expectIdent('ORDER BY column');
      let dir: 'ASC' | 'DESC' = 'ASC';
      if (this.atKeyword('DESC')) {
        this.advance();
        dir = 'DESC';
      } else if (this.atKeyword('ASC')) {
        this.advance();
      }
      orderBy = { column, dir };
    }

    let limit: number | null = null;
    if (this.atKeyword('LIMIT')) {
      this.advance();
      const t = this.peek();
      if (t.type !== 'number' || t.value.includes('.')) {
        throw new MiniDbError(`LIMIT expects a non-negative integer at position ${t.pos}`);
      }
      this.advance();
      limit = Number(t.value);
    }

    return { type: 'select', columns, table, where, orderBy, limit };
  }

  private parseDropTable(): Statement {
    this.expectKeyword('DROP');
    this.expectKeyword('TABLE');
    const table = this.expectIdent('table name');
    return { type: 'dropTable', table };
  }

  // ---------- expressions ----------

  private parseExpr(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.atKeyword('OR')) {
      this.advance();
      left = { type: 'logic', op: 'OR', left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.atKeyword('AND')) {
      this.advance();
      left = { type: 'logic', op: 'AND', left, right: this.parseNot() };
    }
    return left;
  }

  private parseNot(): Expr {
    if (this.atKeyword('NOT')) {
      this.advance();
      return { type: 'not', expr: this.parseNot() };
    }
    return this.parseComparison();
  }

  private parseComparison(): Expr {
    const left = this.parsePrimary();
    const t = this.peek();
    if (t.type === 'op') {
      this.advance();
      return { type: 'binary', op: t.value, left, right: this.parsePrimary() };
    }
    return left;
  }

  private parsePrimary(): Expr {
    const t = this.peek();
    if (t.type === 'symbol' && t.value === '(') {
      this.advance();
      const inner = this.parseExpr();
      this.expectSymbol(')');
      return inner;
    }
    if (t.type === 'ident') {
      this.advance();
      return { type: 'column', name: t.value };
    }
    return { type: 'literal', value: this.parseLiteral() };
  }

  private parseLiteral(): Value {
    const t = this.peek();
    if (t.type === 'number') {
      this.advance();
      return Number(t.value);
    }
    if (t.type === 'string') {
      this.advance();
      return t.value;
    }
    if (t.type === 'keyword') {
      if (t.value === 'TRUE') { this.advance(); return true; }
      if (t.value === 'FALSE') { this.advance(); return false; }
      if (t.value === 'NULL') { this.advance(); return null; }
    }
    throw new MiniDbError(`Expected a literal value at position ${t.pos}, got '${t.value}'`);
  }

  // ---------- token helpers ----------

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private atKeyword(kw: string): boolean {
    const t = this.peek();
    return t.type === 'keyword' && t.value === kw;
  }

  private atSymbol(sym: string): boolean {
    const t = this.peek();
    return t.type === 'symbol' && t.value === sym;
  }

  private eatSymbol(sym: string): boolean {
    if (this.atSymbol(sym)) {
      this.advance();
      return true;
    }
    return false;
  }

  private expectKeyword(kw: string): void {
    if (!this.atKeyword(kw)) {
      const t = this.peek();
      throw new MiniDbError(`Expected ${kw} at position ${t.pos}, got '${t.value || 'end of input'}'`);
    }
    this.advance();
  }

  private expectSymbol(sym: string): void {
    if (!this.atSymbol(sym)) {
      const t = this.peek();
      throw new MiniDbError(`Expected '${sym}' at position ${t.pos}, got '${t.value || 'end of input'}'`);
    }
    this.advance();
  }

  private expectIdent(what: string): string {
    const t = this.peek();
    if (t.type !== 'ident') {
      throw new MiniDbError(`Expected ${what} at position ${t.pos}, got '${t.value || 'end of input'}'`);
    }
    this.advance();
    return t.value;
  }
}

/** Convenience: SQL text -> AST for one statement. */
export function parseSql(sql: string): Statement {
  return new Parser(tokenize(sql)).parseStatement();
}
