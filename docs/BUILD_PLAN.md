# Build Plan

## Foundation — current build

- Monorepo scaffold.
- Locked project instructions.
- Two-database schema.
- Provider-type profiles.
- Provider Gate service.
- External adapter contracts.
- Research-run API.
- Outreach queue API.
- Initial web command center.

## Vertical Slice 1 — South Africa Dental

Goal: prove the whole operating loop.

User request:
> Find dental providers in South Africa capable of comprehensive dental evaluations, bitewings, and panoramic radiographs. Exclude providers we already know or have already researched. Find usable contact information and prepare qualified targets for outreach.

Required output:
- research run
- provider candidates
- evidence
- gate decisions
- contacts
- service findings
- pricing findings when available
- qualified operational facility records
- campaign targets
- correct dental email template
- agreement-generation request
- READY queue
- Excel/Outlook batch export

## Vertical Slice 2 — Apollo

Import the Apollo facility roster and treat it as a multi-entity corporate-network campaign.

Required capabilities:
- organization / brand / facility relationship modeling
- legal/operator/contracting-entity review
- local vs corporate contact routing
- one-to-many location targeting
- separate HOLD state for ambiguous relationship/entity cases
- batch agreements without layout changes
- batch outreach with corporate/local routing

## After vertical slices

- AI model router and source-grounded research workers.
- Evidence review UI.
- Pricing/service intelligence workspace.
- Follow-up dashboard and communication timeline.
- Excel/Outlook export/reconciliation.
- Network Map and International Search production adapters.
- Pricing Agreement Generator production adapter.
- Optional mobile review client.
