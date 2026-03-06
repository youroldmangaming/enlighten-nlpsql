# Enlighten

**Ask plain English questions about your data. Get instant answers with charts.**

Enlighten is a self-hosted data intelligence platform that connects a natural language interface to your PocketBase database. Type a question, get a visualised answer powered by Metabase — no SQL required.

![Stack](https://img.shields.io/badge/PocketBase-SQLite-green) ![Stack](https://img.shields.io/badge/Metabase-Analytics-blue) ![Stack](https://img.shields.io/badge/Ollama-LLM-orange) ![Stack](https://img.shields.io/badge/Node.js-20-brightgreen)

---

## How It Works

```
User question → nlsql → Ollama (LLM) → SQL → PocketBase SQLite → Metabase card → Answer + Chart
```

1. You ask a question in plain English via `chat.html`
2. **nlsql** introspects your PocketBase schema and asks Ollama to generate a `SELECT` query
3. The query runs read-only against PocketBase's SQLite file
4. Ollama summarises the results in plain English
5. Ollama picks the best chart type (bar, line, pie, scalar, table...)
6. A Metabase card is created automatically and embedded in the chat as an iframe

---

## Stack

| Service | Purpose |
|---|---|
| [PocketBase](https://pocketbase.io) | Application database (SQLite) + static file host |
| [Metabase](https://metabase.com) | Analytics dashboards and chart rendering |
| [nlsql](./NLSQL) | Natural language → SQL engine (Node.js) |
| [Ollama](https://ollama.com) | Local LLM inference (external machine) |


---

## Prerequisites

- Docker + Docker Compose
- Ollama running and accessible on your network with a model pulled (e.g. `llama3.2:3b`)
- PocketBase data directory

---

## Quick Start

**1. Clone and configure**

```bash
git clone https://github.com/youroldmangaming/enlighten
cd enlighten
```

Edit `docker-compose.yml` and set your values:

```yaml
# In the nlsql service
- OLLAMA_HOST=http://<your-ollama-ip>:11434
- OLLAMA_MODEL=llama3.2:3b
- METABASE_USER=your@email.com
- METABASE_PASS=yourpassword
- METABASE_DB_ID=2          # confirm after Metabase setup

# In metabase-db (if using Postgres)
- POSTGRES_PASSWORD=yourpassword
```

**2. Start the stack**

```bash
docker compose up -d
```

**3. Set up Metabase**

- Open `http://localhost:3000`
- Complete the setup wizard — skip adding data during wizard
- Go to **Admin → Databases → Add database**
  - Type: `SQLite`
  - Filename: `/pb_data/data.db`
- Go to **Admin → Public sharing → Enable**
- Confirm your database ID: `http://localhost:3000/api/database`
  Update `METABASE_DB_ID` in `docker-compose.yml` if needed, then `docker compose up -d --build nlsql`

**4. Open the chat**

Copy `chat.html` to your PocketBase public folder:

```bash
cp chat.html ./pocketbase_public/chat.html
```

Navigate to `http://localhost:88/chat.html`

---

## nlsql API

The nlsql service exposes a simple REST API:

```
POST /query
Body: { "question": "string", "history": [] }
Returns: { question, sql, results, answer, metabase_url }
```

```
GET /schema    — introspected PocketBase schema
GET /health    — { ok: true }
```

All routes are mirrored under `/nlsql/*` for reverse proxy path routing.

**Example:**

```bash
curl -X POST http://localhost:4000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "how many users are in the database?"}'
```

---

## Project Structure

```
.
├── docker-compose.yml
├── chat.html                  # Chat UI (copy to pocketbase_public/)
├── NLSQL/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js           # Express server, routes, retry logic
│       ├── llm.js             # Ollama calls (SQL gen, viz pick, summarise)
│       ├── schema.js          # PocketBase schema introspection
│       ├── db.js              # Read-only SQLite query runner
│       └── metabase.js        # Metabase API client
├── HAL9000/                   # AI assistant service
├── gameserver/                # Game backend service
└── pocketbase_public/         # Static files served by PocketBase
```

---

## Configuration Reference

| Variable | Service | Description |
|---|---|---|
| `OLLAMA_HOST` | nlsql, hal9000 | Ollama API URL |
| `OLLAMA_MODEL` | nlsql | Model name (`ollama list` to check) |
| `DB_PATH` | nlsql | Path to SQLite file inside container |
| `METABASE_URL` | nlsql | Metabase base URL from container |
| `METABASE_USER` | nlsql | Metabase admin email |
| `METABASE_PASS` | nlsql | Metabase admin password |
| `METABASE_DB_ID` | nlsql | Numeric ID of PocketBase DB in Metabase |

---

## Security Notes

- PocketBase API rules **do not apply** to direct SQLite file access — nlsql and Metabase bypass them entirely
- Both mounts use `:ro` (read-only) — containers cannot write to the database
- nlsql rejects all non-`SELECT` SQL before execution
- Conversation history is stored in the browser only — not persisted server-side

---

## Useful Commands

```bash
# Rebuild nlsql after code changes
docker compose up -d --build nlsql

# View nlsql logs
docker logs nlsql --tail 50 -f

# Check available Ollama models
curl http://<ollama-host>:11434/api/tags

# Test the API directly
curl -X POST http://localhost:4000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "show me all tables"}'
```

---

## Known Limitations

- Small models (3b) occasionally generate invalid SQL — one-shot retry is built in but complex queries may still fail
- Metabase H2 internal database is not recommended for production — migrate to Postgres for reliability
- Metabase cards accumulate over time — no automatic cleanup
- Conversation history is lost on page reload

---

## License

MIT
