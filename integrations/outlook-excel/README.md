# Excel / Outlook Bridge

This integration is deliberately local. The cloud application prepares a READY outreach queue; the corporate desktop uses Excel/VBA to create individual Outlook messages.

## Queue contract

The API endpoint:

```
GET /api/outreach/export.csv
```

returns one row per READY outreach message with:
- outreach message ID
- campaign target ID
- campaign
- provider
- city/country
- contact
- To
- CC
- subject
- full email body
- agreement file/reference
- status

The default CC includes:

```
mcaskey@occu-med.com
```

## Desktop behavior

The macro bridge should support:
- test active row
- draft next batch
- draft all READY
- send active row
- send all READY with deliberate confirmation
- skip already drafted/sent rows
- attach the exact matching agreement
- write DRAFTED/SENT/ERROR back into the workbook
- export results for reconciliation into the application

The VBA module here is the reusable engine. A workbook generator will be added after the API queue contract is stable.
