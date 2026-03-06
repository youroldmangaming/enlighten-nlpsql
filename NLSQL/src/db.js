import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/pb_data/data.db";

/**
 * Runs a read-only SELECT query and returns rows as an array of objects.
 * The database is opened and closed per query to avoid holding locks.
 */
export function runQuery(sql) {
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

  try {
    const rows = db.prepare(sql).all();
    return rows;
  } finally {
    db.close();
  }
}



