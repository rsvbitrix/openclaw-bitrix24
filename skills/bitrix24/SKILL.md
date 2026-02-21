---
name: bitrix24
description: Manage Bitrix24 CRM deals, contacts, leads, tasks, calendar, drive, and messaging via REST API
version: 0.1.0
metadata:
  openclaw:
    requires:
      env:
        - BITRIX24_WEBHOOK_URL
      bins:
        - curl
    primaryEnv: BITRIX24_WEBHOOK_URL
    emoji: "B24"
    homepage: https://github.com/rsvbitrix/openclaw-bitrix24
    tags:
      - crm
      - tasks
      - productivity
      - bitrix24
      - bitrix
      - b24
---

# Bitrix24

You can manage a Bitrix24 portal via its REST API. All calls use the webhook URL in `BITRIX24_WEBHOOK_URL`.

## API Call Pattern

```bash
curl -s "${BITRIX24_WEBHOOK_URL}<method>.json" -d '<params>' | jq .result
```

Rate limit: **2 req/s**. Batch up to 50 calls with `batch`.

## Modules

Detailed instructions for each module are in the supporting files:

- **crm.md** — CRM: deals, contacts, leads, companies, activities, statuses
- **tasks.md** — Tasks: create, update, complete, delegate, checklists, comments
- **calendar.md** — Calendar: events, create/list/update
- **drive.md** — Drive: storages, folders, files, upload/download
- **chat.md** — Messaging: send messages, notifications, chat management
- **users.md** — Users: search, get by ID, departments, structure

Read the relevant file before making API calls for that module.

## Common Patterns

### Pagination
Results return 50 items per page. Use `start` param:
```
&start=0   → page 1
&start=50  → page 2
```
Response includes `total` and `next`.

### Filters
```
filter[FIELD]=value       exact match
filter[>FIELD]=value      greater than
filter[<FIELD]=value      less than
filter[>=FIELD]=value     greater or equal
filter[%FIELD]=value      LIKE (contains)
filter[!FIELD]=value      not equal
```

### Date Format
ISO 8601: `2026-03-01T18:00:00+03:00`

### Multi-field Values (phone, email)
```
fields[PHONE][0][VALUE]=+79001234567
fields[PHONE][0][VALUE_TYPE]=WORK
fields[EMAIL][0][VALUE]=user@example.com
fields[EMAIL][0][VALUE_TYPE]=WORK
```

### Batch Requests
Combine up to 50 calls in one request:
```bash
curl -s "${BITRIX24_WEBHOOK_URL}batch.json" \
  -d 'cmd[deals]=crm.deal.list&cmd[contacts]=crm.contact.list' | jq .result
```

### Error Handling
On error, response contains `error` and `error_description` fields. Common errors:
- `QUERY_LIMIT_EXCEEDED` — rate limit hit, wait and retry
- `ACCESS_DENIED` — insufficient permissions for this method
- `NOT_FOUND` — entity with given ID doesn't exist
