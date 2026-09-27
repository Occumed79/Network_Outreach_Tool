# Build Plan

## Product definition

Network Outreach is for **large-scale provider outreach after providers have already been identified**.

No provider-research functionality belongs in this repository.

## Phase 1 — Outreach foundation

Completed / current:
- operational Neon schema
- provider identity normalization
- International Search current-network exclusion
- provider-type routing profiles
- email templates
- Pricing Agreement Generator integration
- agreement persistence
- Outlook export
- communication/status model

## Phase 2 — Large-scale intake

Current focus:
- campaign creation
- CSV intake
- manual intake
- Network Map JSON handoff contract
- 5,000-row bounded batches
- batch dedupe
- intake audit rows
- exclusion / review / error counts
- reuse of prior Outreach facilities

## Phase 3 — Batch preparation

- prepare selected providers
- prepare all eligible providers
- missing-email visibility
- agreement-generation status
- READY count
- export only fully prepared targets
- retry failed agreement preparation safely

## Phase 4 — Outlook round trip

- draft/send individualized emails
- return DRAFTED / SENT / ERROR to the application
- capture bounces and replies
- preserve Outlook identifiers so exact drafts can be reconciled

## Phase 5 — Follow-up operations

- follow-up due dashboard
- waiting on pricing
- waiting on PSA
- replied
- declined
- ready to use
- completed
- campaign completion metrics

## Phase 6 — UX polish

Use the design system to make high-volume work fast:
- compact campaign overview
- bulk selection
- sticky provider table controls
- obvious exceptions
- quick filters
- provider detail drawer
- batch action feedback
- agreement/message preview
- keyboard-efficient operations

## Explicit exclusions

Do not add:
- research runs
- web-search engines
- provider-discovery AI
- Tavily/Exa research orchestration
- natural-language provider finder
- separate research database
- duplicate copies of Network Map or International Search
