import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/pb_data/data.db";

/**
 * Returns a simplified schema object:
 * { tableName: [{ name, type }] }
 * Skips PocketBase internal tables (prefixed with _)
 */
export function getSchema() {
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

  try {
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master 
         WHERE type='table' AND name NOT LIKE '\\_%' ESCAPE '\\'
         ORDER BY name`
      )
      .all();

    const schema = {};

    for (const { name } of tables) {
      const columns = db.prepare(`PRAGMA table_info("${name}")`).all();
      schema[name] = columns.map((c) => ({ name: c.name, type: c.type }));
    }

    return schema;
  } finally {
    db.close();
  }
}

/**
 * Returns schema as a compact string for LLM prompts
 */
export function schemaToString(schema) {
  return Object.entries(schema)
    .map(([table, cols]) => {
      const colList = cols.map((c) => `${c.name} ${c.type}`).join(", ");
      return `${table}(${colList})`;
    })
    .join("\n");
}

