# Add New Shop Instance

Add a new ePages webshop to VilkasAnalytics multi-tenant platform.

## Instructions

You are helping add a new shop instance to VilkasAnalytics. This is a multi-step process. The user will provide the shop details.

### Required Information (ask if not provided)
1. **Shop name** (e.g., "Automaalit.net")
2. **ePages API URL** (e.g., "https://shop.epages.com/rs/shops/SHOPID")
3. **ePages access token**
4. **Currency**: EUR or SEK
5. **Language**: fi (Finnish) or sv (Swedish)
6. **Domain** (e.g., "automaalit.net")
7. **How many months of historical data** to sync (default: 13 for YoY)
8. **Slack channel name** for notifications (optional)

### Process

Follow this exact order. Read the detailed guide at: `/Users/markkukorkiakoski/.claude/projects/-Users-markkukorkiakoski-Desktop-VilkasAnalytics/memory/adding-new-instance.md`

**Phase 1: Database Setup**
1. Generate SQL to insert into `stores` table (with API credentials)
2. Generate SQL to insert into `shops` table (with currency, domain)
3. Generate SQL to link user via `shop_members`
4. Ask user to run the SQL in Supabase dashboard
5. Record the store_id and shop_id for subsequent steps

**Phase 2: Historical Data Sync**
1. Use `api/cron/sync-epages-range.js` endpoint
2. Sync in 5-day batches to avoid Vercel timeouts
3. Start from 13 months ago for YoY comparison
4. Monitor each batch - if timeout, reduce to 3-day batches

**Phase 3: Slack Setup** (if requested)
1. Guide user to create Slack channel
2. Guide user to add Incoming Webhook in Slack app (App ID: A0AHN55P5C5)
3. Store webhook URL in shops table
4. Send test greeting in the shop's language

**Phase 4: Initial Analyses**
1. Run KPI calculation (week + month): `POST /api/cron/calculate-kpi` with `store_id`
2. Run Growth Engine snapshot: `POST /api/cron/save-growth-snapshot`
3. Run Emma document indexing: `POST /api/cron/index-emma-documents`

**Phase 5: Frontend**
1. Add shop logo to `src/config/shopLogos.js`
2. Optionally add brand keywords to `src/lib/brandVsNonBrand.js`

**Phase 6: Verification**
1. Check Tilannekuva page shows KPI indices
2. Check Myynti page shows sales with correct currency
3. Check Analyysit page works
4. Remind user to connect GSC and GA4 via Settings page

### Key Technical Details
- **Two ID system**: storeId (stores.id) for ePages data, shopId (shops.id) for analytics data
- **VAT rates**: Finland 24%, Sweden 25% - determined by currency in shops table
- **ePages API**: Slow, ~1 API call per order detail. Always batch.
- **Vercel timeout**: 5 min max (Pro plan). Use maxDuration: 300 for sync endpoints.
- All cron jobs are already multi-tenant (iterate shops table)
- All API endpoints accept store_id/shop_id from request

$ARGUMENTS
