# Network Outreach Architecture

## Product boundary

Network Outreach is the execution layer after provider identification.

It must not duplicate Network Map's research/discovery function.

## System flow

```text
Network Map / CSV / manual provider list
                |
                v
        NETWORK OUTREACH
        Provider intake
                |
                v
      Local outreach history
                |
                v
      International Search
  existing-network exclusion
        |               |
   existing           eligible
      |                 |
   exclude              v
                 Campaign target
                        |
              +---------+---------+
              |                   |
              v                   v
        Email template      Agreement route
                                  |
                                  v
                      Pricing Agreement Generator
              |                   |
              +---------+---------+
                        v
                  READY queue
                        |
                        v
                  Excel / Outlook
                        |
                        v
             Sent / Reply / Follow-up
                        |
                        v
                   Completed
```

## Data ownership

Network Outreach uses one operational Neon database.

It owns:
- campaigns
- intake batches
- intake rows
- facilities used in outreach
- contacts used in outreach
- campaign targets
- email templates
- agreements
- messages
- events/status history

The application does not own a research database.

## Provider intake

Provider intake accepts records that have already been identified.

Supported sources:
- Network Map handoff via JSON
- CSV import
- manual provider entry
- future controlled integrations that supply provider records

Intake is bounded at 5,000 rows per batch.

Before creating campaign targets:
- duplicates inside the imported batch are suppressed
- prior Network Outreach records are reused
- International Search checks the current Occu-Med network
- uncertain exclusion checks are held for review

## Existing-network exclusion

International Search is the current-network exclusion source.

Network Outreach queries:

```
GET {INTERNATIONAL_SEARCH_API_URL}/api/network/search
```

A confident facility-level match becomes `EXISTING_NETWORK` and does not create a new outreach target.

If that exclusion source is unavailable, the intake row becomes `NEEDS_REVIEW`; it does not silently become NEW.

## Campaign preparation

Campaign targets hold:
- priority
- owner
- pricing-request flag
- PSA-needed flag
- current status
- follow-up date
- result/decision
- notes

Preparation creates an individualized message and, when required, requests the correct provider agreement.

Batch preparation runs with bounded concurrency.

## Agreement integration

Network Outreach calls the existing Pricing Agreement Generator API.

The generator remains authoritative for document layout and field substitution.

Generated documents are persisted against the campaign target and exposed through a durable download route.

## Outlook integration

READY messages export as one row per provider with:
- campaign target ID
- provider
- contact
- To
- CC
- subject
- complete email body
- exact agreement file/reference
- status

The desktop Excel/VBA bridge creates individual Outlook messages.

## UI model

The web application is organized around execution:
- Dashboard
- Campaigns
- Providers
- Outreach Queue
- Agreements
- Follow-Ups

No research tab exists.
