// Tokenizer (lexer) for MiniDB SQL.
// Turns raw SQL text into a flat list of tokens the parser consumes.

import { MiniDbError } from '../engine/errors';

export type TokenType =
  | 'keyword'
  | 'ident'
  | 'number'
  | 'string'
  | 'symbol' // ( ) , ; *
  | 'op' // = != <> < <= > >=
  | 'eof';

export interface Token {
  type: TokenType;
  /** Normalized value: keywords are upper-cased, strings are unquoted/unescaped. */
  value: string;
  /** Character offset in the source, for error messages. */
  pos: number;
}

const KEYWORDS = new Set([
  'CREATE', 'TABLE', 'INSERT', 'INTO', 'VALUES', 'SELECT', 'FROM', 'WHERE',
  'DROP', 'AND', 'OR', 'NOT', 'ORDER', 'BY', 'LIMIT', 'ASC', 'DESC',
  'INT', 'FLOAT', 'TEXT', 'BOOL', 'TRUE', 'FALSE', 'NULL',
]);

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}
function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch) || ch.charCodeAt(0) > 127;
}
function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch) || ch.charCodeAt(0) > 127;
}

export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    // Line comment: -- until end of line
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }

    // String literal: 'it''s' -> it's
    if (ch === "'") {
      const start = i;
      i++;
      let value = '';
      let closed = false;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            value += "'";
            i += 2;
          } else {
            closed = true;
            i++;
            break;
          }
        } else {
          value += sql[i];
          i++;
        }
      }
      if (!closed) {
        throw new MiniDbError(`Unterminated string literal at position ${start}`);
      }
      tokens.push({ type: 'string', value, pos: start });
      continue;
    }

    // Number literal: 42, 3.14
    if (isDigit(ch) || (ch === '.' && isDigit(sql[i + 1] ?? ''))) {
      const start = i;
      let seenDot = false;
      while (i < sql.length && (isDigit(sql[i]) || (sql[i] === '.' && !seenDot))) {
        if (sql[i] === '.') seenDot = true;
        i++;
      }
      tokens.push({ type: 'number', value: sql.slice(start, i), pos: start });
      continue;
    }

    // Identifier or keyword
    if (isIdentStart(ch)) {
      const start = i;
      while (i < sql.length && isIdentPart(sql[i])) i++;
      const raw = sql.slice(start, i);
      const upper = raw.toUpperCase();
      if (KEYWORDS.has(upper)) {
        tokens.push({ type: 'keyword', value: upper, pos: start });
      } else {
        tokens.push({ type: 'ident', value: raw, pos: start });
      }
      continue;
    }

    // Symbols
    if (ch === '(' || ch === ')' || ch === ',' || ch === ';' || ch === '*') {
      tokens.push({ type: 'symbol', value: ch, pos: i });
      i++;
      continue;
    }

    // Operators
    if (ch === '=' || ch === '<' || ch === '>' || ch === '!') {
      const start = i;
      const two = sql.slice(i, i + 2);
      if (two === '<=' || two === '>=' || two === '!=' || two === '<>') {
        tokens.push({ type: 'op', value: two === '<>' ? '!=' : two, pos: start });
        i += 2;
      } else if (ch === '!') {
        throw new MiniDbError(`Unexpected character '!' at position ${i} (did you mean '!='?)`);
      } else {
        tokens.push({ type: 'op', value: ch, pos: start });
        i++;
      }
      continue;
    }

    throw new MiniDbError(`Unexpected character '${ch}' at position ${i}`);
  }

  tokens.push({ type: 'eof', value: '', pos: sql.length });
  return tokens;
}
