# Network Outreach Tool Architecture

## Product boundary

Network Outreach Tool is the orchestration and operating layer for provider-network development. It does not replace Network Map, International Search, Pricing Agreement Generator, or Outlook. It coordinates them.

## System map

```text
Natural-language request
        |
        v
Research run
        |
        +--> Network Map provider discovery
        +--> supplemental web/AI discovery
        +--> contact research
        +--> service research
        +--> pricing research
        +--> evidence capture
        |
        v
Provider Gate
        |
        +--> this app's operational provider/outreach history
        +--> International Search existing-provider exclusion
        +--> this app's prior outreach / suppression history
        |
        v
Qualified target
        |
        +--> provider-type profile
        +--> email template
        +--> Pricing Agreement Generator adapter
        |
        v
Review / READY queue
        |
        v
Excel + Outlook local bridge
        |
        v
Draft / send / reply / follow-up
        |
        v
Operational history + provider onboarding
```

## Two-database design

### DATABASE_URL — operational

System-of-record for the workflow owned by this app:
- organizations and facilities
- contacts
- services
- pricing
- evidence promoted to operational records
- suppression/exclusion rules
- campaigns and targets
- email templates
- agreement-document references
- outreach messages and events
- follow-up state

### DATABASE_URL_2 — research

Working area for noisy/ephemeral research:
- research runs
- raw candidates
- evidence
- contact candidates
- service findings
- pricing findings
- external-system match candidates
- model decisions
- research events

Only reviewed/qualified records are promoted into the operational database.

## Integration contracts

### Network Map

Purpose: provider discovery/intelligence for facilities that are not in the current Occu-Med network.

Current read contract:

```
GET {NETWORK_MAP_API_URL}/api/provider-explorer
```

Network Outreach consumes stored/candidate provider records as discovery leads. Saved/current-network records are excluded from discovery calls. Every discovered provider still passes through the Provider Gate before outreach.

### International Search

Purpose: authoritative existing-provider/network exclusion.

Current read contract:

```
GET {INTERNATIONAL_SEARCH_API_URL}/api/network/search
```

Network Outreach queries International Search using the candidate's name and geography. A confident facility-level match means the provider is already in the Occu-Med network and should not enter new-provider outreach.

International Search is not used as Network Outreach's provider-discovery engine.

### Pricing Agreement Generator

Purpose: create the provider-specific document from the existing template system.

The outreach app provides:
- provider name
- address
- provider type/template key
- country/currency
- campaign target ID

The generator returns:
- external generation ID
- file name
- download/storage URL
- sha256 when available
- status

The outreach app never reconstructs agreement page layout.

### Excel / Outlook bridge

Purpose: operate inside the corporate desktop environment.

READY targets should eventually export:
- outreach target ID
- facility
- contact
- To
- CC
- subject
- body
- exact agreement path/reference
- status fields

The local macro creates individual Outlook drafts/sends and later returns status/events for reconciliation.

## Provider Gate

The gate must operate in this order:

1. This app's operational records and prior outreach.
2. Explicit suppression/exclusion rules.
3. International Search existing-provider/network exclusion.
4. Fuzzy/ambiguous identity review if the exclusion check is incomplete or ambiguous.

Network Map is upstream discovery, not an exclusion step.

The gate returns a decision, confidence, reasons, and matched source.

## AI responsibilities

AI is a research and reasoning layer, not the source of truth.

Appropriate tasks:
- extract provider/contact/service/pricing facts
- normalize entities and addresses
- classify provider type
- resolve brand/operator/contracting relationships
- compare conflicting sources
- rank candidate contacts
- draft provider-type-specific outreach
- suggest match decisions

Every material research fact should remain traceable to evidence.
