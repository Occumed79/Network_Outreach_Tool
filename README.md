# Network Outreach Tool

Occu-Med's high-volume provider outreach execution system.

**Network Outreach starts after providers have already been identified.** It does not research for providers.

The product turns provider lists into:

**intake → existing-network exclusion → campaign targets → individualized agreement + email preparation → Outlook queue → tracking/follow-up → completion**

## System roles

- **Network Map** — provider research/discovery. It supplies selected provider prospects to Outreach.
- **International Search** — existing/current Occu-Med network. Outreach uses it as the exclusion list.
- **Pricing Agreement Generator** — existing provider-agreement generation engine.
- **Excel/Outlook** — local corporate sending bridge.
- **Network Outreach Tool** — campaign-scale execution and tracking.

## What this repository owns

- campaigns
- CSV/manual/Network Map provider intake
- batch dedupe
- existing-network exclusion
- provider/contact records required for outreach
- campaign targets
- provider-type email routing
- agreement requests/references
- READY queue
- Outlook CSV export
- communication/status tracking
- follow-ups
- pricing/PSA outcome state

It deliberately does **not** own:
- provider discovery
- web research
- natural-language research runs
- AI research workers
- a separate research database

## Stack

```text
apps/web/               React/Vite outreach operations console
services/api/           TypeScript API
packages/core/          Shared provider/outreach types
db/operational/         Operational Neon migrations
integrations/            Excel/Outlook bridge
```

## Database

Only `DATABASE_URL` is required by Network Outreach.

```bash
DATABASE_URL=
INTERNATIONAL_SEARCH_API_URL=
AGREEMENT_GENERATOR_URL=
PUBLIC_BASE_URL=
```

## Core API flow

### Create campaign

```
POST /api/campaigns
```

### Import identified providers

JSON / Network Map handoff:

```
POST /api/campaigns/:campaignId/providers
```

CSV:

```
POST /api/campaigns/:campaignId/import.csv
```

Every imported provider passes through:
1. Network Outreach prior-history/dedupe check.
2. International Search existing-network exclusion.
3. Campaign target creation only when eligible.

### Prepare outreach

```
POST /api/campaigns/:campaignId/prepare
```

### Export READY individualized messages

```
GET /api/outreach/export.csv?campaignId=:campaignId
```

## Local development

Requires Node 22+ and pnpm 10+.

```bash
cp .env.example .env
pnpm install
pnpm --filter @network-outreach/api migrate
pnpm dev
```

Web: http://localhost:5173  
API: http://localhost:8787

Read `AGENTS.md` before changing product architecture.
