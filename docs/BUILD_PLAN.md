# Build Plan

## Foundation — completed

- Monorepo scaffold.
- Locked project instructions.
- Two-database schema.
- Provider-type profiles.
- Provider Gate service.
- External adapter contracts.
- Research-run API.
- Outreach queue API.
- Initial web command center.
- Candidate review and promotion workflow.
- Agreement-aware outreach preparation.
- Outlook export contract.

## Capability 1 — Universal provider research

Goal: accept any provider-development request without hard-coding a country, specialty, company, or campaign.

Required behavior:
- natural-language research request
- user-selected or later AI-classified provider type
- arbitrary country / region / city
- Network Map as the primary structured provider-discovery/intelligence source
- optional supplemental web research sources
- source-grounded AI extraction where needed
- provider candidates with evidence
- named contacts and usable email addresses when supported
- service-capability findings
- pricing findings when available
- no invention of unsupported facts

## Capability 2 — Provider identity and exclusion

Every candidate must pass through the same Provider Gate.

Required checks:
- this application's prior outreach history
- International Search existing-provider/network exclusion
- Network Map discovery provenance on the candidate, never as an exclusion source
- website/domain, phone, email, normalized name/address, geography, aliases, parent/network identity
- explicit suppression rules
- distinguish active provider, follow-up, prior decline, duplicate, intermediary, closed, seen-before, and genuinely new

## Capability 3 — Outreach preparation

Qualified providers should flow into campaigns regardless of specialty or geography.

Required behavior:
- provider-type email template routing
- existing Pricing Agreement Generator integration
- provider-specific agreement metadata
- no agreement page reconstruction in this repo
- pricing requested / PSA needed / priority / owner / follow-up state
- READY queue only when required artifacts are available

## Capability 4 — Local Outlook execution

The cloud application prepares outreach. The corporate desktop performs individualized sending.

Required behavior:
- export READY targets
- To / CC / subject / body / exact agreement
- default CC: mcaskey@occu-med.com
- Excel/VBA draft and send actions
- no mass BCC blast
- DRAFTED / SENT / ERROR reconciliation back to the app

## Validation datasets

Validation datasets are tests of the universal system, not product features.

- Apollo: large multi-location corporate-network validation; exercises brand/facility/operator/contracting-entity distinctions and large-batch outreach.
- Dental, audiology, cardiology, laboratories, vaccination, imaging, occupational health, hospitals, and other provider classes: validate provider-type routing and capability requirements across arbitrary geographies.

## Next implementation work

- complete the generic automated research worker
- production Network Map discovery adapter
- production International Search existing-network exclusion adapter
- Pricing Agreement Generator adapter
- evidence review UI
- pricing/service intelligence workspace
- follow-up dashboard and communication timeline
- Excel/Outlook reconciliation
- model routing / cost controls / evaluation telemetry
