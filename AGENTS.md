# Network Outreach Tool — Standing Project Instructions

These rules define the product. Do not simplify the application into a generic CRM, provider finder, or mail-merge tool.

## Product purpose

Network Outreach Tool is Occu-Med's provider-network development operating system. It owns the workflow from provider discovery through research, exclusion, contact/pricing enrichment, agreement preparation, outreach, follow-up, and provider onboarding.

This project is for provider/business information such as pricing, service capability, contact information, agreements, billing/account setup, and outreach history. It is not a patient-record system and must not require patient information.

## Core workflow

A natural-language request such as "Find dental providers in South Africa" should ultimately support:

1. Discover direct provider entities.
2. Resolve organization, facility, location, operator/contracting entity, and relationship type.
3. Research documented services, pricing, named decision-makers, direct emails, phones, and source evidence.
4. Check Network Map to determine whether the provider is already known/in-network.
5. Check International Search / prior research history to determine whether the provider was already discovered or investigated.
6. Check this application's outreach history to determine whether the provider was already contacted, declined, bounced, or is due for follow-up.
7. Suppress, merge, resume, enrich, or continue based on those findings.
8. Route qualified providers to the correct provider-type email template and existing Pricing Agreement Generator template.
9. Create a reviewable outreach target with evidence and confidence.
10. Export READY targets to the local Excel/Outlook bridge for individualized drafting/sending.
11. Track outreach events, pricing responses, PSA status, follow-up dates, replies, outcomes, and onboarding.

## Existing-system boundaries

- This repository starts from scratch. Do not copy old application code wholesale into it.
- Network Map remains the canonical source for the existing Occu-Med provider universe and is an exclusion/enrichment source.
- International Search is a seen-before / discovery-history source and can also contribute external-provider research.
- Pricing_Agreement_Generator remains the agreement-generation engine. Do not build a competing document generator here.
- Excel/Outlook is the local corporate-email execution bridge. The cloud app prepares the queue; Outlook performs the actual sending unless the user explicitly changes this architecture.
- Integrate through adapters/APIs so those systems remain independently maintainable.

## Provider identity and exclusion gate

Never match providers by name alone. Provider identity may use:
- website/domain
- phone
- email/domain
- normalized name + address
- normalized name + city + country
- coordinates/proximity
- parent organization
- aliases/previous names
- source-system IDs

Possible gate outcomes include:
- NEW
- EXISTING_NETWORK
- SEEN_BEFORE
- PREVIOUSLY_CONTACTED
- FOLLOW_UP_DUE
- ACTIVE_PROVIDER
- DECLINED
- DO_NOT_CONTACT
- DUPLICATE
- INTERMEDIARY
- CLOSED
- NEEDS_REVIEW

Do not simply discard every prior match. A previous research record may be reusable; a prior outreach may need follow-up; an existing network provider may need enrichment.

## Research quality

- Prefer direct clinics, hospitals, laboratories, dental practices, imaging centers, and other actual care providers.
- Exclude aggregators, referral networks, third-party networks, TPAs, and intermediaries unless the user explicitly asks for them.
- Occu-Med does not do workers' compensation. Do not create workers' compensation outreach flows.
- Preserve evidence for meaningful claims: source URL, retrieval time, relevant excerpt/field, and confidence.
- Never invent an email address, contact person, title, service, price, ownership relationship, or contracting entity.
- Distinguish brand, facility, operator, owner, franchisee, management partner, and contracting entity.
- A brand relationship does not prove that the brand can bind a local entity.

## Pricing and services

Pricing and service availability are separate facts. A provider record may contain:
- posted price
- quoted price
- currency
- price source
- quote date
- explicit service availability
- availability source
- notes
- agreement rate

Do not infer service availability merely because a price appears.

## Agreements

Agreement generation is delegated to Pricing_Agreement_Generator.
- Route by provider type/template.
- Preserve original agreement/document layout.
- Do not rebuild or reflow agreement pages.
- Only approved template fields may be substituted.
- Store generated-document metadata and linkage in this app.

## Outreach

Every target should be able to track:
- status
- priority
- owner
- pricing requested
- PSA needed
- last contact
- next follow-up
- days since contact
- follow-up flag
- communication history
- result/decision
- source evidence

Core statuses include:
NOT_STARTED, RESEARCHING, READY, CONTACTED, WAITING_ON_PRICING, WAITING_ON_PSA, NEED_FOLLOW_UP, READY_TO_USE, NO_FIT, ON_HOLD, COMPLETED, DECLINED, BOUNCED.

Default Occu-Med CC for provider outreach:
mcaskey@occu-med.com

## Data ownership

Two Neon databases are used:
- DATABASE_URL: operational/canonical outreach data owned by this application.
- DATABASE_URL_2: research/AI working data such as raw candidates, evidence, model decisions, matching work, and research logs.

Do not commit connection strings or credentials. Use environment variables/secrets only.

## UI

The main web app is the primary product surface. It should feel like a premium, light, modern Occu-Med operating console rather than a generic CRM:
- white / soft gray background
- dark charcoal text
- restrained blue accents
- generous whitespace
- strong typography
- rounded cards
- clear status and evidence treatments
- fast provider tables and review queues

Mobile and native desktop clients may be added later against the same API. Do not fork business logic into separate clients.

## Non-negotiable product principle

The system should reduce repetitive provider-development work without hiding evidence or making unsupported decisions. AI may research, extract, classify, match, and draft; high-impact ambiguity must remain reviewable.
