const METABASE_URL = process.env.METABASE_URL || "http://metabase:3000";
const METABASE_USER = process.env.METABASE_USER;
const METABASE_PASS = process.env.METABASE_PASS;
const METABASE_DB_ID = parseInt(process.env.METABASE_DB_ID || "1", 10);

let sessionToken = null;

/**
 * Authenticate with Metabase and cache the session token.
 * Tokens are long-lived so we only re-auth on 401.
 */
async function getSession() {
  if (sessionToken) return sessionToken;

  const res = await fetch(`${METABASE_URL}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: METABASE_USER, password: METABASE_PASS }),
  });

  if (!res.ok) throw new Error(`Metabase auth failed: ${res.status}`);
  const data = await res.json();
  sessionToken = data.id;
  return sessionToken;
}

async function mbFetch(path, options = {}) {
  const token = await getSession();
  const res = await fetch(`${METABASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Metabase-Session": token,
      ...options.headers,
    },
  });

  // Re-auth on session expiry
  if (res.status === 401) {
    sessionToken = null;
    return mbFetch(path, options);
  }

  return res;
}

/**
 * Create a native SQL card in Metabase.
 * Returns the card object including its id.
 */
export async function createCard(name, sql, display = "table", visualization_settings = {}) {
  const res = await mbFetch("/api/card", {
    method: "POST",
    body: JSON.stringify({
      name,
      display,
      dataset_query: {
        type: "native",
        native: { query: sql },
        database: METABASE_DB_ID,
      },
      visualization_settings,
    }),
  });

  if (!res.ok) throw new Error(`Failed to create Metabase card: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Enable public sharing on a card and return the public URL.
 */
export async function getPublicCardUrl(cardId) {
  const res = await mbFetch(`/api/card/${cardId}/public_link`, {
    method: "POST",
  });

  if (!res.ok) throw new Error(`Failed to get public link: ${res.status} ${await res.text()}`);
  const { uuid } = await res.json();
  return `${METABASE_URL}/public/question/${uuid}`;
}

/**
 * Delete a card by id (for cleanup of ephemeral cards).
 */
export async function deleteCard(cardId) {
  await mbFetch(`/api/card/${cardId}`, { method: "DELETE" });
}




