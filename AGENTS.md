# Network Outreach Tool — Standing Project Instructions

These rules define the product. Do not turn this application into a provider-research product.

## Product purpose

Network Outreach Tool is Occu-Med's high-volume provider outreach execution system.

The application begins **after providers have already been identified**. Its job is to turn provider lists into correctly prepared, individualized, tracked outreach at scale.

It owns:
- provider intake
- current-network exclusion
- campaign organization
- provider/contact records needed for outreach
- template routing
- provider-specific agreement generation
- individualized email preparation
- Outlook-ready export
- status/follow-up tracking
- response/pricing/agreement outcomes
- onboarding/completion state

It does **not** own provider research or provider discovery.

## System boundaries

- **Network Map** is the research/discovery application. Network Map identifies provider prospects. It may send selected providers to Network Outreach through the intake API or exported files.
- **International Search** contains the existing/current Occu-Med provider network and is used as the exclusion list.
- **Pricing_Agreement_Generator** remains the agreement-generation engine. Network Outreach requests documents from it; do not rebuild document layout here.
- **Excel/Outlook** remains the corporate email execution bridge. Network Outreach prepares individualized rows/messages/attachments for Outlook.
- Do not copy those applications into this repository.
- Do not add Tavily, Exa, web-search workers, LLM provider discovery, research runs, research-candidate workflows, or a research workspace here.

## Core workflow

1. Create/select an outreach campaign.
2. Import providers already identified elsewhere:
   - Network Map handoff
   - CSV/Excel-derived CSV
   - manual entry
3. Normalize provider identity.
4. Check Network Outreach history for prior contact/suppression.
5. Check International Search to determine whether the provider is already in the current Occu-Med network.
6. Exclude current-network / do-not-contact / declined providers.
7. Reuse existing Network Outreach provider records when appropriate.
8. Route eligible providers to the correct email and agreement templates.
9. Prepare individualized provider outreach.
10. Export READY providers to Excel/Outlook.
11. Track sent, bounced, replied, follow-up, pricing, PSA, declined, completed, and ready-to-use outcomes.

## Provider identity and exclusion

Never match by provider name alone.

Useful identity signals include:
- normalized name
- address
- city/country
- phone
- email
- website/domain
- source-system IDs
- aliases/previous names
- parent organization when needed

Network Map must never be used as proof that a provider is already in-network.

International Search existing-network data is the current-network exclusion source.

If the existing-network exclusion check cannot be completed, do not automatically classify the provider as new. Route it to review.

## Large-scale outreach principles

The product must work for hundreds or thousands of providers in a campaign.

Required behaviors:
- batch intake
- dedupe before target creation
- exclusion counts
- clear review queue
- batch agreement/message preparation
- individualized emails, never one mass BCC message
- exact provider-specific agreement attachment
- bulk-ready export
- campaign-level progress metrics
- resumable provider status tracking
- follow-up visibility

## Outreach state

Core states:
- NOT_STARTED
- READY
- CONTACTED
- WAITING_ON_PRICING
- WAITING_ON_PSA
- NEED_FOLLOW_UP
- READY_TO_USE
- NO_FIT
- ON_HOLD
- COMPLETED
- DECLINED
- BOUNCED

Default provider-outreach CC:
mcaskey@occu-med.com

## Agreements

Agreement generation is delegated to Pricing_Agreement_Generator.

- Route by provider type/template.
- Preserve the original agreement layout.
- Do not reconstruct/reflow agreement pages in this repo.
- Store the generated document/reference against the campaign target.
- A PSA-required target cannot be READY for Outlook export until its agreement is generated.

## Data

`DATABASE_URL` is the Network Outreach operational database.

It owns:
- campaigns
- imports/intake rows
- facilities used in outreach
- contacts used in outreach
- campaign targets
- templates
- agreements
- messages
- communication events
- follow-up/status history
- exclusion decisions

`DATABASE_URL_2` is not part of the Network Outreach product and must not be required by this application.

## UI

The web app is an outreach operations console.

Primary navigation:
- Dashboard
- Campaigns
- Providers
- Outreach Queue
- Agreements
- Follow-Ups

The first screen should communicate campaign execution status, not ask the user to research for providers.

Use a premium light Occu-Med visual language:
- white/soft gray surfaces
- dark charcoal text
- restrained blue accent
- generous whitespace
- strong typography
- rounded cards
- dense but readable provider tables
- obvious status/action cues

## Non-negotiable rule

**Network Outreach starts when a provider or provider list has already been identified. Its job is to turn those providers into correctly prepared, sent, tracked, and completed outreach.**
