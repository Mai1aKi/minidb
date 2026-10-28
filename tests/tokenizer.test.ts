import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/sql/tokenizer';

describe('tokenizer', () => {
  it('tokenizes a simple SELECT', () => {
    const tokens = tokenize('SELECT * FROM users WHERE age >= 18;');
    expect(tokens.map((t) => `${t.type}:${t.value}`)).toEqual([
      'keyword:SELECT',
      'symbol:*',
      'keyword:FROM',
      'ident:users',
      'keyword:WHERE',
      'ident:age',
      'op:>=',
      'number:18',
      'symbol:;',
      'eof:',
    ]);
  });

  it('keywords are case-insensitive, identifiers keep their case', () => {
    const tokens = tokenize('select Name from Users');
    expect(tokens[0]).toMatchObject({ type: 'keyword', value: 'SELECT' });
    expect(tokens[1]).toMatchObject({ type: 'ident', value: 'Name' });
    expect(tokens[3]).toMatchObject({ type: 'ident', value: 'Users' });
  });

  it("unescapes '' inside string literals", () => {
    const tokens = tokenize("'it''s a db'");
    expect(tokens[0]).toMatchObject({ type: 'string', value: "it's a db" });
  });

  it('skips -- line comments', () => {
    const tokens = tokenize('-- a comment\nSELECT 1');
    expect(tokens[0]).toMatchObject({ type: 'keyword', value: 'SELECT' });
  });

  it('normalizes <> to !=', () => {
    const tokens = tokenize('a <> b');
    expect(tokens[1]).toMatchObject({ type: 'op', value: '!=' });
  });

  it('throws on unterminated strings', () => {
    expect(() => tokenize("'oops")).toThrowError(/Unterminated string/);
  });

  it('throws on stray characters', () => {
    expect(() => tokenize('SELECT @')).toThrowError(/Unexpected character/);
  });
});
