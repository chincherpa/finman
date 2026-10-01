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

1. **Mapping** (`mapping.csv`, *Einstellungen → Empfänger-Zuordnung*): raw bank recipient → payee + default comment.
   Exact match first, then a fuzzy key (no store numbers, `GIR …`, `//city/de`, legal forms), then longest word prefix.
   Pending card payments (`Kartenzahlung/-en`) are matched by terminal ID.
2. **Rules** (*Einstellungen → Regeln*): override payee/category/comment by purpose, raw name, IBAN or booking type,
   e.g. PayPal + purpose contains "Spotify" → category `Paypal Freizeit`.
3. **Category** (`werte.csv`, *Kategorien (Werte)*): payee → Kategorie 0/1/2 + fixed cost flag.
   Names may carry a qualifier (`Amazon Flora`, `Paypal Lebensmittel`); the picker suggests variants of the payee.

Anything without a clear payee + category (or with a placeholder payee like `Amazon X`, `… oder …`) lands in
**Zu prüfen**. While fixing a transaction you can save the decision as mapping or rule; similar open transactions
are re-resolved immediately. Manually edited transactions are never overwritten.

Re-importing an overlapping export is safe: rows are deduplicated by hash, pending card payments are replaced by
their booked version, and `**Endsaldo**` lines become balance snapshots for the net worth chart.

## Reports

- **Ausgaben** – expenses by group / category / payee (refunds netted against their base category, transfers and savings excluded)
- **Cashflow** – Sankey income → groups/categories, savings and surplus
- **Vermögen / Konten / Kredite** – balances from snapshots + transactions, manual accounts, loan repayments by search text

## Development

```bash
pnpm test            # vitest – parser, dedupe, pending reconcile, resolver
pnpm db:generate     # after changing src/db/schema.ts
pnpm build
```
