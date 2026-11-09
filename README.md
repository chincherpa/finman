# Finance Manager

Local web app for importing and categorising bank exports (Sparkasse/BW-Bank CSV, `umsaetze-*.csv`).
Next.js 15 · SQLite (better-sqlite3 + Drizzle) · Recharts/ECharts.

## Start

```bash
pnpm install
pnpm seed documents/umsaetze-*.csv   # loads mapping.csv + werte.csv, optional bank CSVs
pnpm dev                             # http://localhost:3000
```

The database lives in `data/finance.db` (gitignored). Back it up via *Einstellungen → Daten*.

## How a transaction gets categorised

1. **Mapping** (`mapping.csv`, *Zuordnungen → Empfänger*): raw bank recipient → payee + default comment.
   Exact match first, then a fuzzy key (no store numbers, `GIR …`, `//city/de`, legal forms), then longest word prefix.
2. **Rules** (*Zuordnungen → Regeln*): override payee/category/comment by purpose, raw name, IBAN or booking type,
   e.g. PayPal + purpose contains "Spotify" → category `Paypal Freizeit`.
3. **Category** (`werte.csv`, *Zuordnungen → Kategorien*): payee → Kategorie 0/1/2 + fixed cost flag.
   Names may carry a qualifier (`Amazon Flora`, `Paypal Lebensmittel`); the picker suggests variants of the payee.

Anything without a clear payee + category (or with a placeholder payee like `Amazon X`, `… oder …`) lands in
**Zu prüfen**. While fixing a transaction you can save the decision as mapping or rule; similar open transactions
are re-resolved immediately. Manually edited transactions are never overwritten.

Re-importing an overlapping export is safe: rows are deduplicated by hash (the `**Endsaldo**` marker is stripped
before hashing), card reservations (`Kartenzahlung/-en`) are ignored until the bank books them, and `**Endsaldo**`
lines become balance snapshots for the net worth chart. Rows without a valid booking date abort the import.

## Reports

- **Ausgaben** – expenses by group / category / payee (refunds netted against their base category, transfers and savings excluded)
- **Cashflow** – Sankey income → groups/categories, savings and surplus
- **Vermögen / Konten / Kredite** – balances from snapshots + transactions, manual accounts, loan repayments by search text

## Access / security

The app is protected by HTTP Basic Auth (`src/middleware.ts`). **Without `FINMAN_PASSWORD` the production server
refuses every request.** On the Pi create `~/finman/data/.finman.env` (`chmod 600`):

```
FINMAN_PASSWORD=...
FINMAN_USER=finman        # optional
FINMAN_HOST=127.0.0.1     # optional: only reachable through a reverse proxy / Tailscale (default 0.0.0.0)
```

Basic Auth is sent in clear text over HTTP – on an untrusted network put TLS (Caddy/nginx/Tailscale) in front.
`deploy.ps1` calls `..\deploy-pi-all.ps1`, which lives outside this repository; use `deploy-pi.ps1` otherwise.
Requires Node >= 22.

## Development

```bash
pnpm test            # vitest – parser, dedupe, Endsaldo, refunds, DST, resolver
pnpm import:legacy   # one-off import of the old manual export (see scripts/import-legacy.ts)
pnpm db:snapshot     # consistent single-file copy of the live DB (used by the deploy scripts)
pnpm db:generate     # after changing src/db/schema.ts
pnpm build
```
