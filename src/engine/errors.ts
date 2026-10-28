/** Every error the engine raises on purpose (syntax, type, lookup, ...). */
export class MiniDbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MiniDbError';
  }
}
