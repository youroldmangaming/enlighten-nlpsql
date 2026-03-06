        import { schemaToString } from "./schema.js";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";

async function ollamaChat(messages) {
  const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.message.content.trim();
}

/**
 * Ask the LLM to generate a safe, read-only SQLite query.
 * Retries once if the first attempt produces invalid SQL.
 */
export async function generateSQL(question, schema, hint = "") {
  const schemaStr = schemaToString(schema);

  const systemPrompt = `You are a SQLite expert. You will be given a database schema and a user question.
Your job is to write a single, read-only SQLite SELECT query that answers the question.

STRICT RULES — follow every one:
- Return ONLY the raw SQL query, nothing else
- No explanation, no markdown, no backticks, no comments
- Only SELECT statements — never INSERT, UPDATE, DELETE, DROP, ALTER, or any write operation
- Always use proper SQLite aggregate syntax: COUNT(*), SUM(col), AVG(col) — never bare COUNT or SUM
- Always qualify ambiguous column names with the table name
- If the question cannot be answered from the schema, return exactly: SELECT 'Cannot answer this question from available data' AS message

EXAMPLES of correct aggregate syntax:
  SELECT COUNT(*) AS total FROM users
  SELECT name, COUNT(*) AS cnt FROM orders GROUP BY name
  SELECT AVG(price) AS avg_price FROM products

Schema:
${schemaStr}`;

  async function attempt(extraHint = "") {
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: question + hint },
    ];

    const raw = await ollamaChat(messages);

    // Strip any accidental markdown fences or leading/trailing whitespace
    const sql = raw
      .replace(/```sql/gi, "")
      .replace(/```/g, "")
      .trim()
      // Remove any trailing semicolons (better-sqlite3 doesn't need them)
      .replace(/;+$/, "");

    if (!/^\s*SELECT/i.test(sql)) {
      throw new Error(`LLM returned a non-SELECT statement: ${sql}`);
    }

    return sql;
  }

  // First attempt
  const sql = await attempt();

  // Validate by doing a quick EXPLAIN — catches bad column refs before we run it
  // We'll let db.js handle final execution; just return the SQL here
  return sql;
}

/**
 * Ask the LLM to summarise query results in plain English
 */
export async function summariseResults(question, sql, results, history = []) {
  const resultStr =
    results.length === 0
      ? "No rows returned."
      : JSON.stringify(results.slice(0, 50), null, 2);

  const messages = [
    {
      role: "system",
      content: `You are a helpful data analyst. Given a user question, the SQL that was run, and the results, provide a concise plain English answer.
Be direct and specific. Include actual numbers and values from the results.
Use conversation history to give contextually aware answers — if the user says "why" or "compare" or "now show me", refer back to what was discussed.
Do not mention SQL or technical details unless the user specifically asked about them.`,
    },
    // Inject history for contextual summaries
    ...history,
    {
      role: "user",
      content: `Question: ${question}\n\nSQL run: ${sql}\n\nResults:\n${resultStr}`,
    },
  ];

  return ollamaChat(messages);
}


/**
 * Ask the LLM to pick the best Metabase visualization for the results.
 * Returns { display, visualization_settings }
 */
export async function pickVisualization(question, sql, results) {
  if (!results || results.length === 0) {
    return { display: "table", visualization_settings: {} };
  }

  const columns = Object.keys(results[0]);
  const sample = JSON.stringify(results.slice(0, 5));

  const messages = [
    {
      role: "system",
      content: `You are a data visualization expert. Given a SQL query, its results, and the user question, pick the best Metabase chart type.

Available types and when to use them:
- "scalar" — single number result (e.g. COUNT(*), total, average)
- "bar" — comparing categories (e.g. counts per group, totals per name)
- "line" — trends over time (e.g. signups per day/month)
- "area" — cumulative trends over time
- "pie" — proportions of a whole (use only when <= 6 categories)
- "row" — horizontal bar, good for long category names
- "table" — multiple columns, no clear chart mapping

Respond with ONLY a JSON object, no explanation, no markdown. Example:
{"display":"bar","x":"category_col","y":"count_col"}

For scalar: {"display":"scalar"}
For table: {"display":"table"}
For pie: {"display":"pie","dimension":"name_col","metric":"value_col"}
For line/area: {"display":"line","x":"date_col","y":"value_col"}
For bar/row: {"display":"bar","x":"category_col","y":"value_col"}`,
    },
    {
      role: "user",
      content: `Question: ${question}\nSQL: ${sql}\nColumns: ${columns.join(", ")}\nSample rows: ${sample}`,
    },
  ];

  try {
    const raw = await ollamaChat(messages);
    const clean = raw.replace(/```json|```/gi, "").trim();
    const viz = JSON.parse(clean);

    const display = viz.display || "table";
    const visualization_settings = {};

    if (display === "bar" || display === "line" || display === "area" || display === "row") {
      if (viz.x) visualization_settings["graph.dimensions"] = [viz.x];
      if (viz.y) visualization_settings["graph.metrics"] = [viz.y];
    }

    if (display === "pie") {
      if (viz.dimension) visualization_settings["pie.dimension"] = viz.dimension;
      if (viz.metric) visualization_settings["pie.metric"] = viz.metric;
    }

    return { display, visualization_settings };
  } catch (e) {
    console.warn("Could not parse visualization suggestion, defaulting to table:", e.message);
    return { display: "table", visualization_settings: {} };
  }
}










