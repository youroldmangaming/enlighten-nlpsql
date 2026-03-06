import express from "express";
import { getSchema } from "./schema.js";
import { runQuery } from "./db.js";
import { createCard, getPublicCardUrl } from "./metabase.js";
import { generateSQL, summariseResults, pickVisualization } from "./llm.js";

const app = express();

// CORS — allow all origins (internal network only anyway)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());

const PORT = process.env.PORT || 4000;

/**
 * Try to run SQL, and if it fails ask the LLM to fix it (one retry).
 */
async function runWithRetry(question, schema, sql) {
  try {
    return { sql, results: runQuery(sql) };
  } catch (firstErr) {
    console.warn(`SQL failed (${firstErr.message}), asking LLM to fix it…`);

    // Ask LLM to fix the broken SQL
    const { generateSQL: gen } = await import("./llm.js");
    const fixedSql = await gen(
      question,
      schema,
      `\n\nNote: The previous attempt generated this SQL which failed with error "${firstErr.message}":\n${sql}\nPlease fix it.`
    );

    try {
      return { sql: fixedSql, results: runQuery(fixedSql) };
    } catch (secondErr) {
      throw new Error(`Query failed after retry: ${secondErr.message}\nSQL: ${fixedSql}`);
    }
  }
}

/**
 * POST /query
 * Body: { "question": "How many users signed up last week?" }
 * Returns: { sql, results, answer, metabase_url }
 */
app.post(["/query", "/nlsql/query"], async (req, res) => {
  const { question, history = [] } = req.body;

  if (!question || typeof question !== "string") {
    return res.status(400).json({ error: "question is required" });
  }

  // Sanitise history — only allow role/content string pairs, cap at 20 messages
  const safeHistory = history
    .filter(m => ["user","assistant"].includes(m.role) && typeof m.content === "string")
    .slice(-20);

  try {
    const schema = getSchema();
    const sql = await generateSQL(question, schema, "", safeHistory);
    const { sql: finalSql, results } = await runWithRetry(question, schema, sql);
    const answer = await summariseResults(question, finalSql, results, safeHistory);

    let metabase_url = null;
    try {
      const { display, visualization_settings } = await pickVisualization(question, finalSql, results);
      const card = await createCard(`nlsql: ${question.slice(0, 80)}`, finalSql, display, visualization_settings);
      metabase_url = await getPublicCardUrl(card.id);
    } catch (mbErr) {
      console.warn("Metabase card creation failed:", mbErr.message);
    }

    return res.json({ question, sql: finalSql, results, answer, metabase_url });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.get(["/schema", "/nlsql/schema"], (_req, res) => {
  try {
    return res.json(getSchema());
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get(["/health", "/nlsql/health"], (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`nlsql listening on port ${PORT}`);
});




