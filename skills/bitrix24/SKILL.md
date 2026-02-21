---
name: bitrix24
description: Manage Bitrix24 CRM deals, contacts, leads, tasks, calendar, and messaging via REST API
version: 1.0.0
metadata:
  openclaw:
    requires:
      env:
        - BITRIX24_WEBHOOK_URL
      bins:
        - curl
    primaryEnv: BITRIX24_WEBHOOK_URL
    emoji: "B24"
    homepage: https://github.com/openclaw/channel-bitrix24
    tags:
      - crm
      - tasks
      - productivity
      - bitrix24
---

# Bitrix24

You can manage a Bitrix24 portal via its REST API. All calls go through the webhook URL stored in `BITRIX24_WEBHOOK_URL`.

## Making API Calls

```bash
curl -s "${BITRIX24_WEBHOOK_URL}<method>.json" \
  -d '<params>' | jq .result
```

Rate limit: **2 requests/second** (standard plan). Batch up to 50 calls with `batch`.

## CRM

### Deals

```bash
# List deals
curl -s "${BITRIX24_WEBHOOK_URL}crm.deal.list.json" \
  -d 'select[]=ID&select[]=TITLE&select[]=STAGE_ID&select[]=OPPORTUNITY' | jq .result

# Create deal
curl -s "${BITRIX24_WEBHOOK_URL}crm.deal.add.json" \
  -d 'fields[TITLE]=New Deal&fields[STAGE_ID]=NEW&fields[OPPORTUNITY]=50000&fields[CURRENCY_ID]=RUB' | jq .result

# Update deal
curl -s "${BITRIX24_WEBHOOK_URL}crm.deal.update.json" \
  -d 'id=123&fields[STAGE_ID]=WON' | jq .result

# Get deal by ID
curl -s "${BITRIX24_WEBHOOK_URL}crm.deal.get.json" -d 'id=123' | jq .result
```

**Stage IDs:** `NEW`, `PREPARATION`, `PREPAYMENT_INVOICE`, `EXECUTING`, `FINAL_INVOICE`, `WON`, `LOSE`.

### Contacts

```bash
# List contacts
curl -s "${BITRIX24_WEBHOOK_URL}crm.contact.list.json" \
  -d 'select[]=ID&select[]=NAME&select[]=LAST_NAME&select[]=PHONE' | jq .result

# Create contact
curl -s "${BITRIX24_WEBHOOK_URL}crm.contact.add.json" \
  -d 'fields[NAME]=Ivan&fields[LAST_NAME]=Petrov&fields[PHONE][0][VALUE]=+79001234567&fields[PHONE][0][VALUE_TYPE]=WORK' | jq .result
```

**Multi-field format** (phone, email): `fields[PHONE][0][VALUE]=+7...&fields[PHONE][0][VALUE_TYPE]=WORK`

### Leads

```bash
# Create lead
curl -s "${BITRIX24_WEBHOOK_URL}crm.lead.add.json" \
  -d 'fields[TITLE]=New Lead&fields[NAME]=Name&fields[PHONE][0][VALUE]=+79001234567' | jq .result

# List leads with filter
curl -s "${BITRIX24_WEBHOOK_URL}crm.lead.list.json" \
  -d 'filter[STATUS_ID]=NEW&select[]=ID&select[]=TITLE' | jq .result
```

### Companies

```bash
curl -s "${BITRIX24_WEBHOOK_URL}crm.company.add.json" \
  -d 'fields[TITLE]=Company Name&fields[COMPANY_TYPE]=CUSTOMER' | jq .result
```

## Tasks

```bash
# Create task
curl -s "${BITRIX24_WEBHOOK_URL}tasks.task.add.json" \
  -d 'fields[TITLE]=Task title&fields[DESCRIPTION]=Details&fields[RESPONSIBLE_ID]=1&fields[DEADLINE]=2026-03-01T18:00:00' | jq .result

# List my tasks
curl -s "${BITRIX24_WEBHOOK_URL}tasks.task.list.json" \
  -d 'select[]=ID&select[]=TITLE&select[]=STATUS&filter[RESPONSIBLE_ID]=1' | jq .result

# Complete task
curl -s "${BITRIX24_WEBHOOK_URL}tasks.task.complete.json" -d 'taskId=456' | jq .result

# Reopen task
curl -s "${BITRIX24_WEBHOOK_URL}tasks.task.renew.json" -d 'taskId=456' | jq .result

# Add checklist item
curl -s "${BITRIX24_WEBHOOK_URL}task.checklistitem.add.json" \
  -d 'TASKID=456&FIELDS[TITLE]=Subtask text' | jq .result
```

**Task statuses:** `2` (Waiting), `3` (In progress), `4` (Supposedly completed), `5` (Completed), `6` (Deferred).
**Priority:** `0` (Low), `1` (Medium), `2` (High).

## Users

```bash
# Current user
curl -s "${BITRIX24_WEBHOOK_URL}user.current.json" | jq .result

# Search user
curl -s "${BITRIX24_WEBHOOK_URL}user.search.json" \
  -d 'FILTER[NAME]=Ivan' | jq .result

# Get user by ID
curl -s "${BITRIX24_WEBHOOK_URL}user.get.json" -d 'ID=1' | jq .result
```

## Calendar

```bash
# Create event
curl -s "${BITRIX24_WEBHOOK_URL}calendar.event.add.json" \
  -d 'type=user&ownerId=1&name=Meeting&from=2026-03-01T10:00:00&to=2026-03-01T11:00:00' | jq .result

# List events
curl -s "${BITRIX24_WEBHOOK_URL}calendar.event.get.json" \
  -d 'type=user&ownerId=1&from=2026-03-01&to=2026-03-31' | jq .result
```

## Messaging

```bash
# Send a chat message (as authenticated user)
curl -s "${BITRIX24_WEBHOOK_URL}im.message.add.json" \
  -d 'DIALOG_ID=1&MESSAGE=Hello!' | jq .result

# Send system notification
curl -s "${BITRIX24_WEBHOOK_URL}im.notify.system.add.json" \
  -d 'USER_ID=1&MESSAGE=Notification text' | jq .result
```

## Drive (Files)

```bash
# List storages
curl -s "${BITRIX24_WEBHOOK_URL}disk.storage.getlist.json" | jq .result

# List folder contents
curl -s "${BITRIX24_WEBHOOK_URL}disk.folder.getchildren.json" -d 'id=123' | jq .result

# Get file info
curl -s "${BITRIX24_WEBHOOK_URL}disk.file.get.json" -d 'id=456' | jq .result
```

## Common Patterns

### Pagination
Results are paginated with 50 items per page. Use `start` to offset:
```
&start=0   (first page)
&start=50  (second page)
```
Response includes `total` and `next` fields.

### Filters
- `filter[FIELD]=value` — exact match
- `filter[>FIELD]=value` — greater than
- `filter[<FIELD]=value` — less than
- `filter[%FIELD]=value` — LIKE (contains)
- `filter[!FIELD]=value` — not equal

### Date Format
ISO 8601: `2026-03-01T18:00:00+03:00`

### Batch Requests
Combine up to 50 calls:
```bash
curl -s "${BITRIX24_WEBHOOK_URL}batch.json" \
  -d 'cmd[deals]=crm.deal.list&cmd[contacts]=crm.contact.list' | jq .result
```
