# Code review – finman

Scope: whole repository at `f2832f7` (app code, import pipeline, scripts, deploy tooling).

How findings were checked:

- **reproduced** – triggered with a script against a temp SQLite DB, or in the built app driven by a headless browser
- **by reading** – follows from the code, not executed

Tooling status: `tsc --noEmit` clean, `pnpm build` succeeds, `pnpm lint` fails (1 error), `pnpm test` cannot run on a fresh clone, `pnpm db:migrate` is broken. See 19–21.

| # | Severity | Finding | Checked |
|---|----------|---------|---------|
| 1 | High | Refunds are counted as income instead of being netted against expenses | reproduced |
| 2 | High | No authentication while listening on `0.0.0.0`; `/api/backup` hands out the whole DB | by reading |
| 3 | High | Overlapping re-import duplicates the booking that carried the `**Endsaldo**` marker | reproduced |
| 4 | Medium | Rows with an unparseable date are stored with `bookingDate = ""` and become unreachable | reproduced |
| 5 | Medium | Sidebar badges are attached to the wrong menu entries | reproduced |
| 6 | Medium | Payee filter breaks for names containing a comma (`Hokema, Maria`) | reproduced |
| 7 | Medium | Category select resets itself on the first change | reproduced |
| 8 | Medium | Deleting a category/mapping/rule: no confirmation, no re-resolve, orphaned references | by reading |
| 9 | Medium | Category edits are invisible for up to 2 s (module-level cache) | reproduced |
| 10 | Medium | Rule amount fields cannot take decimals (`12,5` becomes `125`) | reproduced |
| 11 | Medium | Period arrows drift by a day across DST changes | reproduced |
| 12 | Medium | Saving an unresolved transaction writes the raw bank name as payee | by reading |
| 13 | Medium | Import upload: 1 MB server-action limit and no error feedback | by reading |
| 14 | Low | Bulk "Als Umbuchung" leaves transactions in the review queue | by reading |
| 15 | Low | "Unkategorisiert" drill-down shows a different set than the report counted | by reading |
| 16 | Low | Balance snapshots: first export of a day wins, same-day bookings ignored | by reading |
| 17 | Low | Unvalidated inputs (URL params, dates, amounts, rule regex) | by reading |
| 18 | Low | Dead pending-payment code; README and UI still describe it | by reading |
| 19 | Low | Tests depend on gitignored private files | reproduced |
| 20 | Low | `pnpm lint` fails; `db:migrate` and `import:legacy` scripts are broken or missing | reproduced |
| 21 | Low | `import-legacy.ts` wipes all accounts and produces hashes that never match bank exports | by reading |
| 22 | Low | Deploy scripts: stale `/tmp/finance.db*`, live DB copy, unguarded `rm -rf` | by reading |
| 23 | Nit | Smaller items | by reading |

---

## High

### 1. Refunds are counted as income instead of being netted

`src/lib/queries.ts:73-76`

```ts
let kind: LineKind = "expense";
if (e.kat0 === INCOME_GROUP) kind = "income";
else if (e.kat0 === SAVINGS_GROUP) kind = "savings";
else if (p.amountCents > 0) kind = "income";
```

`effective()` maps `Amazon Flora Erstattung` onto the group of `Amazon Flora`, but the last branch then turns every positive amount into `income`. The spending page only looks at `kind === "expense"`, so the refund never reduces the group. README and the page subtitle ("Erstattungen sind verrechnet") say otherwise.

Reproduced: −50,00 in `Amazon Flora` plus +20,00 in `Amazon Flora Erstattung` gives 60,00 spending in the group (with a third −10,00 booking), not 40,00; the +20,00 shows up as an income source on the cash-flow page.

**Fix**

- Let `effective()` return a `refund: true` flag when `c.kat0 === REFUND_GROUP`.
- In `getLines`, decide the kind from the category first and only fall back to the sign when there is no category:

```ts
if (e.kat0 === INCOME_GROUP) kind = "income";
else if (e.kat0 === SAVINGS_GROUP) kind = "savings";
else if (e.refund) kind = "expense";                       // nets via sumBy(sign = -1)
else if (p.amountCents > 0 && e.kat0 === UNCATEGORIZED) kind = "income";
```

- Decide separately whether a positive amount in an ordinary expense category (a return booked to `Amazon`) should also net. The snippet above nets it; keep the old `p.amountCents > 0` branch if you only want explicit `Erstattung` categories to net.
- Add a test for this. It is the central promise of the spending report.

### 2. No authentication while listening on all interfaces

`ecosystem.config.cjs:15` starts `next start -H 0.0.0.0`. Nothing in the app checks who is calling:

- `GET /api/backup` (`src/app/api/backup/route.ts`) returns the complete SQLite file with all bookings and IBANs.
- `GET /api/export/*` returns the lookup tables.
- Every server action in `src/app/actions.ts` mutates data.

Anyone on the same network (guests, IoT devices, anything reaching the Pi) can read and change everything.

**Fix** – pick one:

- Bind to `127.0.0.1` and reach the app through a reverse proxy with auth (Caddy/nginx basic auth) or through Tailscale/WireGuard only.
- Or add a `middleware.ts` with HTTP Basic Auth from an env var (`FINMAN_PASSWORD`) and match all paths including `/api`.

Server actions already get Next's same-origin check, so no extra CSRF work is needed once auth exists.

### 3. Overlapping re-import duplicates the booking with the `**Endsaldo**` marker

`src/lib/import/parse.ts:86-103`, `src/lib/import/importer.ts:120-134`

The importer supports an Endsaldo marker on a real booking (`kind = "balance"` with a non-zero amount is inserted as a transaction). But `rowHash` includes `purpose`, and the purpose still contains `**Endsaldo** 100,00H`. In the next export the same booking is no longer the last row, has no marker, hashes differently, and is inserted again.

Reproduced: export A (one booking, marker attached) then export B (same booking without marker plus one new row) inserts 2 rows instead of 1.

If your bank only ever puts the marker on a separate zero-amount row, this never triggers; the code path exists, so it should be safe either way.

**Fix** – strip the marker before hashing and storing:

```ts
const saldo = purposeRaw.match(/\s*\*\*Endsaldo\*\*\s*([\d.]+,\d{2})([HS])/);
const purpose = saldo ? purposeRaw.replace(saldo[0], "").trim() : purposeRaw;
```

Existing rows that already carry the marker keep their old hash; write a one-off migration that recomputes the hash for rows whose purpose matches the pattern, or accept one duplicate per past export and delete those by hand.

---

## Medium

### 4. Rows with an unparseable date become unreachable

`src/lib/import/parse.ts:90-91`, `src/lib/format.ts:11-15`

`parseGermanDate` only accepts `dd.mm.yyyy`. Anything else (`05.02.26`, empty cell, changed bank format) yields `bookingDate = ""`, and the row is inserted anyway. Every list filters with `booking_date between …`, so the row is never shown, yet it is counted in the sidebar badge and in account balances.

Reproduced: a row with `05.02.26` is inserted with an empty date; the review badge said 5 while the page listed 4.

**Fix**

- In `parseBankCsv`, throw for non-skip rows without a valid `bookingDate` (include the line number in the message), so the preview shows the error instead of importing.
- Optionally accept two-digit years in `parseGermanDate`.
- Check the existing DB once: `select count(*) from transactions where booking_date = ''`.

### 5. Sidebar badges are on the wrong entries

`src/components/layout/sidebar.tsx:11,17`

"Umsätze" shows the `review` count; "Zu prüfen" shows the `uncategorized` count. The "Zu prüfen" page (`src/app/uncategorized/page.tsx`) lists `tab: "review"`, so its badge and its content are different numbers.

**Fix** – give "Zu prüfen" `badge: "review"` and drop the badge on "Umsätze" (or point it at `/transactions?tab=uncategorized` with the `uncategorized` count).

### 6. Payee filter breaks for names with a comma

`src/lib/queries.ts:181-189`, `src/components/transactions/transactions-view.tsx:181,185`, `src/app/spending/page.tsx:40`

The filter is a comma-joined list in one URL parameter and is split with `split(",")`. `scripts/seed.ts` itself creates the payee `Hokema, Maria`.

Reproduced: `listTransactions({ payee: "Hokema, Maria" })` returns 0 rows although one exists. This affects "Nur diese zeigen", "Diese ausblenden" and the merchant drill-down from the spending page.

**Fix** – use repeated parameters instead of a joined string: write with `next.append("payee", name)`, read with `sp.getAll("payee")` on the client and the array form of `searchParams` on the server, and make `TxFilter.payee` / `excludePayee` a `string[]`.

Related: `getLines` labels a line `t.payee ?? (t.rawName || t.bookingType)` while the filter matches `coalesce(payee, raw_name)`. For bookings without a raw name the drill-down finds nothing. Use the same expression in both places.

### 7. Category select resets itself on the first change

`src/components/transactions/category-select.tsx:21-29,39`

Picking a "Kategorie 0" that has more than one category calls `onChange("")`. The effect then sees an empty `value` and clears `k0`/`k1`, undoing the selection that was just made.

Reproduced: transaction with a category, select "Essen" → the select jumps back to empty; selecting "Essen" a second time sticks.

**Fix** – the effect should only follow the prop when it points at a real category:

```ts
useEffect(() => {
  if (current) { setK0(current.kat0); setK1(current.kat1 || NONE); }
}, [current]);
```

To still clear the selects when the parent resets the value (the × in `CategoryInput`, switching transactions), key the component from the parent (`TxEditor` is already keyed by `tx.id`).

### 8. Deleting lookups: no confirmation, no re-resolve, orphaned references

`src/app/actions.ts:208-212,234-238,257-261`, `src/app/settings/tables.tsx:96,156,264`, `src/app/loans/loan-form.tsx:46`

- One click on the trash icon deletes a mapping, category, rule or loan. There is no confirmation and the action result is ignored.
- `deleteMapping`, `deleteCategory` and `deleteRule` do not call `reResolve`, although the page says changes apply immediately.
- `deleteCategory` leaves `transactions.category` and `splits.category` pointing at a name that no longer exists. Those rows are reported as "Unkategorisiert" but have `needs_review = 0` and `category is not null`, so they are in neither the review queue nor the "Ohne Kategorie" tab.
- `saveCategory` renames the category in `transactions` and `splits` but not in `rules.set_category`, so rules keep assigning the old name. The three updates are not in one DB transaction.

**Fix**

- Ask before deleting (`confirm()` is enough) and show `r.error`.
- In `deleteCategory`: inside one `db.transaction`, set `category = null, needs_review = 1` on non-manual transactions using it (or refuse deletion while it is in use and report the count), then `reResolve(db)`.
- Call `reResolve(db)` after `deleteMapping` and `deleteRule`.
- In `saveCategory`, also `update rules set set_category = <new> where set_category = <old>`, and wrap the rename in `db.transaction`.

### 9. Category edits are invisible for up to 2 seconds

`src/lib/queries.ts:33-40`

`categoryMap()` caches for 2 s in a module variable. The re-render triggered by `revalidatePath` right after `saveCategory` / CSV import happens inside that window and uses the old map.

Reproduced: read the map, update `kat0`, read again → old value.

**Fix** – remove the cache (a few hundred rows from local SQLite are sub-millisecond), or export `invalidateCategoryCache()` and call it from `refresh()` in `actions.ts`. If you want per-request memoisation, wrap the loader in React's `cache()`.

### 10. Rule amount fields cannot take decimals

`src/app/settings/tables.tsx:225-228`

The inputs are controlled by a number (`amountMinCents / 100`) and parse on every keystroke. After typing `12,` the state is `1200`, the field re-renders as `12`, and the next digit gives `125`.

Reproduced: typing `12,5` results in `125`.

**Fix** – keep the raw strings in component state and convert once in `submit()` (reuse the `cents()` helper from `actions.ts`, moved to `src/lib/format.ts`).

### 11. Period arrows drift across DST changes

`src/lib/period.ts:72-75`

The day-based branch adds multiples of 86 400 000 ms to local midnight. Across a 23 h or 25 h day the result is 23:00 or 01:00 and `iso()` lands on the neighbouring date.

Reproduced with `TZ=Europe/Berlin`:

- `2026-10-20 … 2026-10-26`, forward → `2026-10-26 … 2026-11-02` (overlaps by a day, 8 days long)
- `2026-03-30 … 2026-04-05`, back → `2026-03-22 … 2026-03-28` (should be 23rd–29th)

**Fix** – do calendar arithmetic:

```ts
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const days = Math.round((Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())
                       - Date.UTC(f.getFullYear(), f.getMonth(), f.getDate())) / 86_400_000) + 1;
return { from: iso(addDays(f, dir * days)), to: iso(addDays(t, dir * days)) };
```

### 12. Saving an unresolved transaction stores the raw bank name as payee

`src/components/transactions/tx-editor.tsx:23,62-66`

The payee field is pre-filled with `tx.payee ?? tx.rawName`. Saving without touching it sends that string, so `EDEKA WECKERT//STUTTGART/DE` becomes the payee. It then appears in the payee autocomplete, and with a category set the transaction counts as resolved. This also happens when you only add a comment or hide the transaction.

**Fix** – start with `tx.payee ?? ""` and show the raw name as the input's `placeholder`; or track whether the field was edited and send `tx.payee` unchanged if not.

### 13. Import upload: body limit and silent failures

`next.config.ts`, `src/components/transactions/import-button.tsx:19-40`

- Server actions accept 1 MB by default. Several exports in one upload, or one long export, exceed that and the action throws.
- `upload()` and `confirm()` only handle `r.ok`. A thrown error or `ok: false` leaves the button doing nothing.

**Fix**

```ts
// next.config.ts
experimental: { serverActions: { bodySizeLimit: "20mb" } },
```

and wrap both calls in `try/catch`, showing the message in the dialog.

---

## Low

### 14. Bulk "Als Umbuchung" leaves transactions in the review queue

`src/app/actions.ts:162-174` – `updateTransaction` treats `isTransfer` and `hidden` as resolved, `bulkUpdate` does not. Add `if (patch.isTransfer || patch.hidden) set.needsReview = false;`. `bulkUpdate` also has no `try/catch` like the other actions.

### 15. "Unkategorisiert" drill-down differs from the report

`src/lib/queries.ts:196-199` filters `category is null`. The reports also count as uncategorised: categories missing from the table, categories with an empty `kat0`, and uncategorised split parts. They exclude transfers, which the list includes. Build the condition from the same rule: `category is null or category not in (<names with kat0>)`, plus the split case.

### 16. Balance snapshots

`src/lib/import/importer.ts:122-125`, `src/lib/queries.ts:304-316`

- `onConflictDoNothing` keeps the first Endsaldo of a day; a later export on the same day is ignored. Use `onConflictDoUpdate`.
- `at()` only adds bookings with a date after the snapshot date. Bookings on the snapshot day that arrived after the export are never added. Storing the timestamp of the Endsaldo row and comparing against `bookedAt` would fix it; otherwise note the limitation.
- `accountBalances` runs two queries per account; fine for now.

### 17. Unvalidated inputs

- `src/lib/period.ts:53-59`: `?p=foo` makes `presetRange` return `undefined`, so `from`/`to` are undefined and the query throws. `from`/`to`, `tab`, `type` and `month` are taken from the URL as-is. Validate against the preset list and `/^\d{4}-\d{2}-\d{2}$/`, fall back to `last-12`.
- `src/app/actions.ts:278,290`: `addSnapshot` and `saveLoan` accept an empty date (cleared date input). An empty snapshot date becomes the anchor for the balance calculation. Reject it.
- `src/app/actions.ts:26-31`: `cents("1.234")` is read as 1,23 €, although the placeholder suggests German notation. Treat a dot followed by exactly three digits as a thousands separator, or reject the ambiguous case.
- `src/app/actions.ts:117-124`: the rule created from the editor is not validated like `saveRule` (regex syntax); an invalid regex is stored and never matches. Share the validation. `saveRule` also does not check `op2`/`value2`.
- `src/lib/queries.ts:206-217,336-347`: `%` and `_` in the search text and in a loan's `matchText` act as LIKE wildcards. Escape them and add `escape '\'`. A purely numeric search term is always treated as an amount, so a number inside a purpose cannot be searched.

### 18. Dead pending-payment code

`parseBankCsv` never returns `kind = "pending"` (card reservations are `skip`, and there is a test for that). Still present: `RowKind "pending"`, the reconcile and stale-removal blocks in `importer.ts:115-153,165-173`, `ImportSummary.pending/replacedPending/removedPending`, the "Vorgemerkt" tab, the two "Vormerkungen" lines in the import dialogs, and the README paragraph claiming pending payments are replaced.

Also unused: `setSplits` (no UI calls it, so the "Aufgeteilt" tab can never fill) and the `bookingType === "Manuell"` delete path (nothing creates manual transactions).

**Fix** – check `select count(*) from transactions where status = 'pending'` in the real DB. If 0, delete the code and the README text. If not, keep the stale-removal until those rows are gone.

### 19. Tests depend on gitignored files

`tests/import.test.ts:13-15` reads `documents/umsaetze-*.csv`, `mapping.csv` and `werte.csv`; `/documents` is in `.gitignore`. On a fresh clone the suite fails at collection (`ENOENT … scandir documents`), so nothing runs.

**Fix** – add small synthetic fixtures under `tests/fixtures/` (the test file already builds CSV strings from `HEADER`) and keep the real-file tests behind `describe.skipIf(!fs.existsSync(docs))`. Worth adding at the same time: refund netting (1), Endsaldo re-import (3), `shiftPeriod` across DST (11), comma payee filter (6).

### 20. Broken tooling

- `pnpm lint` fails on `ecosystem.config.cjs` (`no-require-imports`). Add `"ecosystem.config.cjs"` and `".next-pi/**"` to `ignores` in `eslint.config.mjs`.
- `package.json` defines `db:migrate: tsx scripts/migrate.ts`; the file does not exist. Migrations already run in `openDb`, so remove the script.
- `scripts/import-legacy.ts:4` documents `npm run import:legacy`, which is not defined. Add `"import:legacy": "tsx scripts/import-legacy.ts"`.
- `deploy.ps1` calls `..\deploy-pi-all.ps1`, which lives outside the repository. Say so in the README or check for the file and print a clear error.
- README still says `pnpm test` covers "pending reconcile".

### 21. `import-legacy.ts`

`scripts/import-legacy.ts:29,55-56`

- `tx.delete(transactions)` removes the bookings of every account (and all splits and manual edits) and re-inserts everything into whichever account `select … get()` returns first. Scope the delete to that account, or take the account number as an argument, and print what will be deleted.
- Hashes are built without `e2eId` and with a differently assembled purpose, so they never equal the hashes of a bank export. Importing a bank CSV that overlaps the legacy period duplicates those bookings. Either document "never import bank files older than the last legacy date" or add a second dedupe key (`account, bookingDate, amountCents, normalised rawName`) for rows that came from the legacy import.

### 22. Deploy scripts

- `push-db-pi.ps1:35`: `mv /tmp/finance.db* "$D"/` also moves files left in `/tmp` by an earlier, aborted push. An old `-wal` next to a new `finance.db` can corrupt it. Run `rm -f /tmp/finance.db*` on the Pi before `scp`, or copy into a fresh `mktemp -d`.
- `push-db-pi.ps1` and `deploy-pi.ps1` copy `finance.db`, `-wal` and `-shm` while `pnpm dev` may be writing; the scripts only warn. Create a consistent copy first (`sqlite3 data/finance.db "VACUUM INTO 'data/finance-push.db'"`, or better-sqlite3's `db.backup()` in a small script) and send that single file.
- `scripts/pi-install.sh:127-128`: `find "$APP_DIR" … -exec rm -rf` trusts `APP_DIR`. With `-AppDir ~` it clears the home directory except four names. Refuse to run unless the directory is empty or contains `ecosystem.config.cjs`.
- `scripts/pi-install.sh:157`: `pnpm install --prod --frozen-lockfile || pnpm install --prod` silently falls back to an unlocked install. Fail instead.

---

## Nits

- `sidebar-notes.md` is scratch content; remove it from the repo.
- `/mappings` and `/settings` render the same three tables; keep one.
- `src/app/settings/tables.tsx:91,149`: tables stop at 500/600 rows while the toolbar shows the full count. Paginate or say "erste 500".
- `src/lib/queries.ts:228`: the transaction list stops at 500 rows and "select all" only covers those.
- `src/lib/import/parse.ts:35` and `src/lib/import/lookups.ts:16,94` contain literal U+FFFD / U+FEFF characters in the source. Write `"�"` and `"﻿"` so an editor cannot strip them.
- `src/lib/import/lookups.ts:93`: `toCsv` does not quote fields containing `\r`.
- `src/lib/import/importer.ts:96`: the account is taken from the first row only; reject files with more than one `Kontonummer`.
- `src/lib/import/importer.ts:111-114`: `inArray` with one bind parameter per row fails above ~32 000 rows; chunk it if a full-history import is ever needed.
- `src/app/actions.ts:99-131`: update, mapping insert and rule insert are separate statements; wrap them in `db.transaction`.
- `src/db/client.ts:10`: the migrations path depends on `process.cwd()`; resolve it relative to the file.
- `src/lib/queries.ts:336-347`: a loan's remaining amount is principal minus all matched payments; `interestRate` is stored and displayed but not used, so interest-bearing loans look paid off too early.
- `previewImportFiles` runs each file in its own rolled-back transaction, so for overlapping files the preview's "Neu" count is higher than the real import.
- `package.json` has no `engines` field although `Map.groupBy` needs Node 21+.
