if (process.env.NODE_ENV !== 'test') {
  throw new Error('Integration tests must run with NODE_ENV=test');
}
if (process.env.DATABASE_URL) {
  throw new Error('Integration tests must not point at an external database');
}
if (!process.env.PGLITE_DATA_DIR) {
  throw new Error('PGLITE_DATA_DIR must point at an isolated temporary directory');
}
