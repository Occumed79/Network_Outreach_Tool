# Network Outreach Tool

Occu-Med's provider-network development operating system.

This application is being built from a blank repository around the full workflow proven during the Apollo outreach project:

**discover → verify → exclude/match → enrich contacts/services/pricing → prepare agreement + email → review → Outlook queue → follow-up → onboard**

## What this repository owns

- Natural-language provider research requests
- Provider/entity normalization
- Provider Gate and exclusion decisions
- Operational provider/outreach records
- Research/AI working records
- Contact, service, pricing, and evidence intelligence
- Outreach campaigns and targets
- Email-template routing
- Agreement-generation requests/references
- Follow-up and communication history
- Excel/Outlook queue integration

## What it does not replace

- **Network Map** — canonical existing provider/network intelligence and exclusion source
- **International Search** — prior discovery/seen-before intelligence and research source
- **Pricing Agreement Generator** — existing document-generation engine
- **Outlook** — corporate email delivery via the local Excel/VBA bridge

## Databases

Two Neon databases are intentionally separated:

- `DATABASE_URL` — operational outreach/provider data
- `DATABASE_URL_2` — research/AI working data

Connection strings belong in environment variables only. Never commit them.

## Repository layout

```text
apps/web/               React/Vite operating console
services/api/           TypeScript API + Provider Gate
packages/core/          Shared provider/outreach types and profiles
db/operational/         Operational Neon migrations + seeds
db/research/            Research Neon migrations
docs/                   Architecture and build plan
```

## Current build

The foundation branch includes:

- locked product instructions in `AGENTS.md`
- two-database schema
- provider/contact/service/pricing/evidence model
- campaign/outreach/agreement model
- provider-type routing profiles
- approved provider-account email seed
- Provider Gate API
- Network Map and International Search adapter contracts
- research-run API
- outreach queue API
- initial premium-light web command center

The first full vertical slice is **South Africa Dental**. Apollo is the second large-scale validation campaign.

## Local development

Requirements:
- Node 22+
- pnpm 10+
- two Neon connection strings

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Web: http://localhost:5173  
API: http://localhost:8787

## Database setup

Apply the migrations to the appropriate database:

Operational:
```
db/operational/001_foundation.sql
db/operational/002_seed_profiles_and_email.sql
```

Research:
```
db/research/001_foundation.sql
```

The application should not auto-create production schema at request time. Migrations remain explicit and reviewable.

## Product rules

Read `AGENTS.md` before changing architecture or workflow. It contains the non-negotiable product behavior recovered from the Apollo project and the broader provider-outreach design.
