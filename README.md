<p align="center">
  <img src="https://repository-images.githubusercontent.com/1097224039/e5e63f74-8cf8-4c4d-98ec-a60bd50639a2" alt="Medsy – A Decentralized Guardian Against Health Misinformation" width="100%" />
</p>

# Medsy💊: The trust layer for AI-powered health information

Medsy is a production-ready **decentralized guardian against health misinformation** built on the OriginTrail DKG
and NeuroWeb. It autonomously verifies health claims against trusted medical sources, structures findings into
JSON‑LD community notes, and publishes them as cryptographically‑signed Knowledge Assets on the global DKG network.

Our system combines:

- 🤖 **Autonomous AI agent workflows** via MCP protocol  
- 🔬 **Multi‑provider AI analysis** (OpenAI, Anthropic, Groq, Mistral)  
- 📚 **Decentralized community notes** with JSON‑LD structure  
- 💰 **TRAC token staking** for consensus building  
- 💎 **x402 micropayments** for premium medical insights  
- 🏆 **Agent reward system** for accurate fact‑checking  
- 🔗 **On‑chain verification** on NeuroWeb testnet  
- 📊 **Real‑time metrics dashboard** and health monitoring  
- 🤝 **Agent‑to‑agent collaboration** via shared DKG memory  

---

## 🧩 Monorepo Overview

This repository is a **DKG Node monorepo** that ships:

- **Medsy Agent App** (`apps/agent`): Expo web app + MCP server + REST API  
- **Medsy Plugin** (`packages/plugin-medsy`): domain logic for health claims, staking, rewards and x402  
- **Additional Plugins** (`packages/plugin-*`): reusable DKG plugins  
- **Database Layer**: SQLite + Drizzle ORM for both agent and Medsy plugin  
- **Authentication & OAuth**: secure access control for human users and agents  

Medsy implements a full **Agent → Knowledge → Trust** stack:

- **Agent layer** – autonomous health verification workflows exposed via MCP tools and HTTP APIs.  
- **Knowledge layer** – JSON‑LD Knowledge Assets on OriginTrail DKG (DKG.js + Edge Node).  
- **Trust layer** – TRAC token staking, on‑chain rewards and x402 micropayments on NeuroWeb.  

---

## 🏗️ Architecture

### Medsy Agent (`apps/agent`)

- Expo Router web UI for submitting and reviewing health claims  
- Node.js server exposing:
  - MCP server (Model Context Protocol)
  - REST API under `/health/*`
  - OAuth authentication and session management  
- Drizzle ORM + SQLite for user, auth and session data  

### Medsy Plugin (`packages/plugin-medsy`)

- **Core services**
  - `AIAnalysisService` – multi‑provider LLM health claim analysis  
  - `DkgService` – JSON‑LD publishing, UAL resolution, SPARQL queries  
  - `TokenomicsService` – TRAC staking, reward calculation, consensus  
  - `PaymentService` / `X402PaymentService` – x402 micropayments  
  - `MetricsService` – system health, staking and premium metrics  
  - `WorkflowOrchestrator` – end‑to‑end autonomous workflows  
- **MCP tools** (9 registered):
  - `autonomous-health-claim-analysis`
  - `analyze-claim`
  - `publish-note`
  - `get-note`
  - `stake-tokens`
  - `access-premium-health-insights`
  - `get-premium-analysis`
  - `distribute-rewards`
  - `complete-premium-payment`

### Data model (Medsy plugin)

- `health_claims` – incoming claims and their analysis status  
- `community_notes` – structured, DKG‑linked JSON‑LD health notes  
- `stakes` – TRAC stakes for/against a note  
- `premium_access` – x402‑paid premium access records  
- `agent_rewards` – rewards per agent and note  

---

## 📋 Requirements

- **Node.js** ≥ 22  
- **npm**  
- **Turbo** CLI (installed globally)  
- Access to an OriginTrail DKG Edge Node (local or remote)  
- TRAC tokens on NeuroWeb testnet for staking and payments  

```bash
npm i -g turbo
```

---

## 🚀 Getting Started

### 1. Install & build (monorepo root)

```bash
npm install
npm run build
```

### 2. Configure environment

#### Agent (root `.env`)

- **`DATABASE_URL`** – SQLite file name (e.g. `dkg.db`)  
- **`OPENAI_API_KEY`** – API key for default LLM provider (optional if using others)  
- **`DKG_PUBLISH_WALLET`** – private key for publishing to DKG / paying TRAC fees  
- **`DKG_BLOCKCHAIN`** – e.g. `otp:20430` (NeuroWeb testnet)  
- **`DKG_OTNODE_URL`** – OT-node / Edge Node URL (e.g. `https://v6-pegasus-node-02.origin-trail.network:8900`)  

#### Medsy plugin (`packages/plugin-medsy/.env.medsy`)

```bash
# Database (optional - defaults to apps/agent/database.db)
# MEDSY_DATABASE_PATH="./custom-path.db"  # Only set if using a different database

# AI
MEDSY_AI_PROVIDER="groq"
MEDSY_AI_MODEL="mixtral-8x7b-32768"
MEDSY_AI_TEMPERATURE="0.7"
MEDSY_AI_MAX_TOKENS="4000"

# DKG
MEDSY_DKG_ENDPOINT="http://localhost:8900"
MEDSY_DKG_BLOCKCHAIN="otp:20430"

# Tokenomics
MEDSY_TRAC_TOKEN_ADDRESS="0xFfFFFFff00000000000000000000000000000001"
MEDSY_REWARD_MULTIPLIER="1.0"

# x402 Micropayments
MEDSY_PAYMENT_ENABLED="true"
MEDSY_STABLECOIN_ADDRESS="0xA0b86a33E6441e88C5F2712C3E9b74F5b6c6C6b7"
MEDSY_MICROPAYMENT_THRESHOLD="0.01"

# Logging
LOG_LEVEL="info"
```

### 3. Bootstrap databases

```bash
# Agent DB (creates database.db with user/auth tables)
cd apps/agent
npm run build:scripts
npm run script:setup   # creates admin user and SQLite DB

# Medsy plugin migrations (adds health claim tables to same database.db)
cd ../../packages/plugin-medsy
npm run db:migrate     # runs migrations on apps/agent/database.db
```

**Note:** Medsy plugin uses the same `database.db` file as the agent. The migration adds Medsy-specific tables (health_claims, community_notes, stakes, etc.) to the existing database.

### 4. Run in development

The full stack requires **3 separate terminals** to run all services:

#### Terminal 1: Start Blazegraph (Triple Store)

```bash
cd dkg-engine/blazegraph
java -jar blazegraph.jar
```

Runs on **port 9999**

#### Terminal 2: Start DKG Engine

```bash
cd dkg-engine/current
node index.js
```

Runs on **port 8900**

#### Terminal 3: Start Agent

```bash
# From repo root
dkg-cli run-dev
# OR
npm run dev
```

Runs on **port 9200**

This starts:

- **Frontend**: `http://localhost:8081` (Expo web app)  
- **Backend**: `http://localhost:9200` (MCP server + REST API)  
- **Medsy API**: `http://localhost:9200/health/*`  
- **Metrics**: `http://localhost:9200/health/metrics`

**Note:** All three services must be running for the full stack to work. The DKG Engine depends on Blazegraph, and the Agent depends on the DKG Engine.  

---

## 🤝 Agent‑to‑Agent demo flow

To run the Medsy **agent‑to‑agent** demonstration flow:

1. **Switch to the `agent-2-agent` branch** (on GitHub or locally):  
   `https://github.com/KilianTrunk/dkg-node/tree/agent-2-agent`
2. From the `dkg-node/packages/plugin-medsy` directory, build the CLI:

```bash
cd packages/plugin-medsy
npm run build
```

3. Still in `packages/plugin-medsy`, start the agent‑to‑agent flow:

```bash
npm run cli:agent-flow
```

This executes the end‑to‑end Medsy workflow where one agent verifies a health claim and another agent consumes the resulting Community Note and on‑chain signals.

---

## 🔬 Medsy Health Verification API

### Health claims analysis

```bash
# Analyze a health claim autonomously
curl -X POST http://localhost:9200/health/claims \
  -H "Content-Type: application/json" \
  -d '{"claim": "Vitamin C cures COVID-19"}'
```

Example response (truncated):

```json
{
  "success": true,
  "claimId": "claim_123",
  "analysis": {
    "verdict": "false",
    "confidence": 0.92,
    "sources": ["WHO", "CDC", "PubMed"]
  },
  "ual": "did:dkg:otp:20430/0x123...",
  "transactionHash": "0x456..."
}
```

### Community notes & consensus

```bash
# Get published community notes
curl http://localhost:9200/health/notes

# View staking consensus for a note
curl http://localhost:9200/health/stakes/note_456

# Check agent rewards distribution
curl http://localhost:9200/health/rewards
```

### Premium access & payments (x402)

```bash
# Request premium access
curl -X POST http://localhost:9200/health/premium \
  -H "Content-Type: application/json" \
  -d '{"noteId": "note_456", "paymentAmount": 0.01}'

# Complete x402 payment
curl -X POST http://localhost:9200/health/x402/complete/payment_123 \
  -H "Content-Type: application/json" \
  -d '{"transactionHash": "0x789..."}'
```

### Metrics & monitoring

```bash
# System health and performance metrics
curl http://localhost:9200/health/metrics

# Claims activity metrics
curl http://localhost:9200/health/metrics/claims

# Staking and tokenomics analytics
curl http://localhost:9200/health/metrics/staking

# Premium access revenue tracking
curl http://localhost:9200/health/metrics/premium
```

---

## 📱 Available scripts (root)

### Development

```bash
npm run dev              # Start app + server
npm run dev:app          # Expo app only
npm run dev:server       # MCP server only
```

### Build

```bash
npm run build            # Build all packages
npm run build:web        # Build web app
npm run build:server     # Build server
npm run build:scripts    # Build utility scripts
npm run build:migrations # Generate database migrations
```

### Testing

```bash
npm run test:api         # Plugin / API tests
npm run test:integration # Cross-plugin integration tests
npm run test:e2e         # Playwright UI tests
npm test                 # Run all tests
```

---

## 🔍 Troubleshooting & Debugging

### Database issues

If you encounter database-related errors or need to inspect your database:

#### Using Drizzle Studio

**Drizzle Studio** provides a web-based interface to view and manage your SQLite databases:

```bash
# From repo root
npm run drizzle:studio
```

Then open [https://local.drizzle.studio](https://local.drizzle.studio) in your browser.

#### Manual migration execution

If automatic migrations fail, you can run them manually:

**Agent database migrations:**
- Location: `apps/agent/drizzle/sqlite/`
- Run manually via Drizzle Studio or execute SQL files directly

**Medsy plugin database migrations:**
- Location: `packages/plugin-medsy/drizzle/`
- Migration file: `0000_health_notes.sql`
- **Important:** Medsy uses the same `database.db` file as the agent (located at `apps/agent/database.db`)
- To run manually:
  1. Open Drizzle Studio: `npm run drizzle:studio`
  2. Navigate to the database: `apps/agent/database.db`
  3. Execute the SQL from `packages/plugin-medsy/drizzle/0000_health_notes.sql`

#### Common database fixes

```bash
# Reset Agent database (this also resets Medsy tables since they share the same DB)
cd apps/agent
rm database.db database.db-shm database.db-wal
npm run script:setup

# Re-run Medsy migrations (adds Medsy tables back to database.db)
cd ../packages/plugin-medsy
npm run db:migrate
```

### Build issues

```bash
# Clean and rebuild
rm -rf node_modules package-lock.json
npm install
npm run build
```

### TypeScript errors

```bash
# Check types across all packages
npm run check-types

# Reinstall dependencies
npm install
npm run build
```

---

## 🤝 Contributing

- Follow the existing monorepo structure and TypeScript strict mode  
- Use `turbo gen` for new packages/apps  
- Run `turbo format check-types lint build` before committing  
- Keep MCP tool schemas and API contracts in sync with implementation  

## 📄 License

This project is part of the DKG ecosystem. See individual package licenses for details.
