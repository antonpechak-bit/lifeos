# Health Sync API

## Required database migration

Run this in the **Supabase SQL Editor** before using the API (adds health columns to `daily_logs`):

```sql
alter table daily_logs
  add column if not exists sleep_hours       numeric,
  add column if not exists sleep_start       text,
  add column if not exists sleep_end         text,
  add column if not exists hrv               numeric,
  add column if not exists resting_heart_rate numeric,
  add column if not exists active_calories   numeric,
  add column if not exists weight            numeric;
```

---

Receives health data from iOS Shortcuts (or any HTTP client) and writes it into the `daily_logs` table.

## Authentication

All POST requests must include the header:

```
X-API-Key: <your key>
```

The key is stored in Vercel as the environment variable `HEALTH_SYNC_API_KEY`. Set it in **Vercel → Project → Settings → Environment Variables**.

## Endpoints

### GET /api/health-sync
Returns `{ "status": "ok" }`. Use this to verify the route is live.

### POST /api/health-sync
Upserts health data for a given user and date.

**Required fields:**
| Field | Type | Notes |
|-------|------|-------|
| `user_id` | string | Supabase user UUID |
| `date` | string | ISO date, e.g. `"2025-06-05"` |

**Optional health fields (send any combination):**
| Field | Type | Example |
|-------|------|---------|
| `steps` | number | `8432` |
| `sleep_hours` | number | `7.5` |
| `sleep_start` | string | `"23:15"` |
| `sleep_end` | string | `"06:45"` |
| `hrv` | number | `52` |
| `resting_heart_rate` | number | `58` |
| `active_calories` | number | `420` |
| `weight` | number | `78.4` |

**Example request:**
```json
{
  "user_id": "abc123-...",
  "date": "2025-06-05",
  "steps": 9200,
  "sleep_hours": 7.2,
  "hrv": 48,
  "resting_heart_rate": 56
}
```

**Example response:**
```json
{
  "success": true,
  "date": "2025-06-05",
  "fields_saved": ["steps", "sleep_hours", "hrv", "resting_heart_rate"]
}
```

## iOS Shortcuts setup

1. Open the **Shortcuts** app → tap **+** to create a new shortcut.
2. Add action: **Get Contents of URL**
   - URL: `https://<your-vercel-domain>/api/health-sync`
   - Method: `POST`
   - Headers: add `X-API-Key` → paste your key
   - Request Body: `JSON`
   - Add the fields you want to send (steps, HRV, etc.)
3. To get today's date automatically, add a **Format Date** action before the URL step:
   - Date: `Current Date`
   - Format: `Custom` → `yyyy-MM-dd`
   - Store the result in a variable named `today`
   - Reference it as `today` in the JSON body.
4. Run the shortcut manually or add it to an **Automation** triggered at a fixed time each day (e.g. 22:00).

### Getting your user_id

1. Log in to Life OS in the browser.
2. Open DevTools → Application → Local Storage → find the Supabase session key.
3. The `user.id` field is your UUID. Paste it as a hardcoded string in the shortcut.

### Getting the API key from Vercel

1. Go to **vercel.com** → your project → **Settings** → **Environment Variables**.
2. Find `HEALTH_SYNC_API_KEY` (create it if it doesn't exist — use any long random string).
3. Copy the value into your iOS Shortcut header.
