# Health Guardian Plugin

**Enterprise-grade plugin for AI-powered health claims verification and decentralized community notes on the OriginTrail DKG.**

## Overview

The Health Guardian plugin creates a **decentralized health claims verification system** that combines AI analysis with community-driven fact-checking and tokenomics-based trust mechanisms. It leverages the OriginTrail Decentralized Knowledge Graph (DKG) to publish verified health information as tamper-proof Knowledge Assets.

## Key Features

**AI-Powered Analysis** - Uses configurable LLM providers (OpenAI, Anthropic, Groq, Mistral) for health claim verification
**Community Notes** - Publish verified health analyses as DKG Knowledge Assets with structured JSON-LD
**Tokenomics Integration** - TRAC token staking for community consensus and reputation
**Premium Access** - x402-compatible micropayments for exclusive content
**Real-time Metrics** - Comprehensive health monitoring and analytics dashboard
**MCP Integration** - Full Model Context Protocol support for AI agent workflows
**Enterprise Architecture** - Service container, Winston logging, graceful shutdown

## Architecture

### Three-Layer Design

1. **Agent Layer** - MCP tools for AI agents to analyze claims and publish notes
2. **Knowledge Layer** - DKG Knowledge Assets for tamper-proof health information
3. **Trust Layer** - Tokenomics and staking for community-driven verification

### Service Architecture

```
HealthGuardianPlugin
├── ServiceContainer (Dependency Injection)
├── AIAnalysisService (LLM Integration)
├── DkgService (DKG Publishing)
├── TokenomicsService (Staking)
├── X402PaymentService (Premium Access)
├── MetricsService (Health Monitoring)
└── Logger (Winston-based)
```

## Quick Start

### 1. Environment Configuration

Create `.env.health-guardian` in the plugin root:

```bash
# Database
HG_DATABASE_PATH="./health-guardian.db"

# AI Configuration
HG_AI_PROVIDER="openai"
HG_AI_MODEL="gpt-4"
HG_AI_TEMPERATURE="0.7"
HG_AI_MAX_TOKENS="4000"

# DKG Configuration
HG_DKG_ENDPOINT="https://your-dkg-node.com"
HG_DKG_BLOCKCHAIN="otp"

# Tokenomics
HG_TRAC_TOKEN_ADDRESS="0x..."

# Logging
LOG_LEVEL="info"
```

### 2. Installation & Setup

```bash
# Install dependencies
npm install

# Run database migrations
npm run db:migrate

# Build the plugin
npm run build

# Development mode
npm run dev
```

### 3. Integration

The plugin automatically registers with the DKG Node Agent. Once configured, it's available at:

- **API Endpoints**: `http://localhost:9200/health/*`
- **MCP Tools**: Available to AI agents via Model Context Protocol
- **Metrics Dashboard**: `http://localhost:9200/health/metrics`

## API Endpoints

### Health Claims
- `GET /health/claims` - Retrieve analyzed health claims
- `GET /health/notes` - Get published community notes
- `GET /health/stakes/:noteId` - View staking consensus for a note

### Metrics & Monitoring
- `GET /health/status` - System health check
- `GET /health/metrics` - Comprehensive metrics dashboard
- `GET /health/metrics/claims` - Claims-specific metrics
- `GET /health/metrics/notes` - Notes-specific metrics
- `GET /health/metrics/staking` - Staking metrics
- `GET /health/metrics/premium` - Premium access metrics

## MCP Tools

### analyze-health-claim
**AI-powered health claim analysis**

```typescript
{
  claim: "Vitamin C cures COVID-19",
  context: "Recent social media posts"
}
```

**Response**: Structured analysis with verdict, confidence, sources, and claim ID

### publish-health-note
**Publish verified analysis as DKG Knowledge Asset**

```typescript
{
  claimId: "claim_123",
  summary: "Analysis summary...",
  confidence: 0.85,
  verdict: "false",
  sources: ["WHO", "CDC", "PubMed"]
}
```

**Response**: DKG UAL and note ID for the published asset

### get-health-note
**Retrieve published community notes**

```typescript
{
  noteId: "note_456",
  ual: "did:dkg:...",
  claimId: "claim_123"
}
```

### stake-tokens
**Stake TRAC tokens on community notes**

```typescript
{
  noteId: "note_456",
  amount: 100,
  position: "support",
  reasoning: "Based on clinical evidence"
}
```

### premium-access
**Purchase premium access to verified content**

```typescript
{
  noteId: "note_456",
  paymentAmount: 0.01
}
```

## Data Model

### Health Claims
```sql
health_claims (
  id INTEGER PRIMARY KEY,
  claimId TEXT UNIQUE,
  claim TEXT,
  status ENUM('analyzing', 'published', 'verified', 'disputed'),
  createdAt DATETIME,
  updatedAt DATETIME
)
```

### Community Notes
```sql
community_notes (
  id INTEGER PRIMARY KEY,
  noteId TEXT UNIQUE,
  claimId TEXT,
  ual TEXT, -- DKG UAL
  summary TEXT,
  confidence REAL,
  verdict ENUM('true', 'false', 'misleading', 'uncertain'),
  sources TEXT, -- JSON array
  createdAt DATETIME,
  updatedAt DATETIME
)
```

### Staking
```sql
stakes (
  id INTEGER PRIMARY KEY,
  noteId TEXT,
  userId TEXT,
  amount REAL, -- TRAC tokens
  position ENUM('support', 'oppose'),
  reasoning TEXT,
  createdAt DATETIME
)
```

### Premium Access
```sql
premium_access (
  id INTEGER PRIMARY KEY,
  userId TEXT,
  noteId TEXT,
  paymentAmount REAL,
  grantedAt DATETIME,
  expiresAt DATETIME
)
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HG_DATABASE_PATH` | SQLite database path | `./health-guardian.db` |
| `HG_AI_PROVIDER` | AI provider (openai/anthropic/groq/mistral) | `openai` |
| `HG_AI_MODEL` | Specific model to use | Provider default |
| `HG_AI_TEMPERATURE` | Response creativity (0.0-1.0) | `0.7` |
| `HG_AI_MAX_TOKENS` | Maximum response length | `4000` |
| `HG_DKG_ENDPOINT` | DKG Edge Node endpoint | - |
| `HG_DKG_BLOCKCHAIN` | Blockchain (otp/polkadot) | - |
| `HG_TRAC_TOKEN_ADDRESS` | TRAC token contract | - |
| `LOG_LEVEL` | Logging level (error/warn/info/debug) | `info` |

## Development

### Project Structure
```
src/
├── config/          # Configuration management
├── database/        # SQLite schema and migrations
├── services/        # Core business logic
│   ├── aiAnalysis.ts    # LLM integration
│   ├── dkgService.ts    # DKG publishing
│   ├── tokenomicsService.ts  # Staking logic
│   ├── x402PaymentService.ts # Premium access
│   ├── metricsService.ts     # Health monitoring
│   └── Logger.ts             # Winston logging
├── tools/           # MCP tool implementations
├── types/           # TypeScript interfaces
└── index.ts         # Plugin entry point
```

### Scripts
```bash
# Development
npm run dev          # Watch mode with TypeScript
npm run build        # Production build
npm run check-types  # TypeScript validation

# Database
npm run db:generate  # Generate migrations
npm run db:migrate   # Run migrations

# Testing
npm run test         # Run test suite
npm run lint         # ESLint checks
```

### Testing
```bash
# Run tests with coverage
npm run test

# Run specific test file
npm run test -- tests/plugin-health-guardian.spec.ts
```

## Monitoring & Metrics

### Health Score Calculation
The system calculates a health score (0-100) based on:
- **Claims Activity**: Recent claim submissions
- **Note Quality**: Published vs unpublished notes
- **Community Engagement**: Staking activity
- **System Performance**: Error rates and response times

### Logging
- **Console Output**: Colored, structured logs
- **Daily Rotation**: Automatic log file rotation
- **Error Isolation**: Separate error log files
- **Performance Tracking**: Operation timing and metrics

## Security Considerations

- **Input Validation**: All API inputs validated with Zod schemas
- **Error Handling**: Sensitive information never leaked in errors
- **Database Security**: Parameterized queries prevent SQL injection
- **DKG Integration**: All published data is cryptographically signed
- **Token Safety**: Smart contract interactions use audited libraries

## Integration with DKG Publisher

This plugin is designed to complement the `plugin-dkg-publisher`:

- **Publisher Plugin**: Infrastructure for publishing any content to DKG
- **Health Guardian**: Domain-specific application using DKG for health verification

The Health Guardian can leverage the Publisher Plugin's enterprise queue system for high-volume publishing scenarios.

## Contributing

1. Follow TypeScript strict mode
2. Add comprehensive error handling
3. Include unit tests for new features
4. Update documentation for API changes
5. Use the established logging patterns

## License

MIT License - OriginTrail Community
