# Lustre Stripe Explorer

A Next.js + TypeScript web app that points at a directory on a Lustre filesystem and shows where
every file's stripes landed across OSTs — a per-file stripe map, per-OST balance statistics, and a
drill-down with the raw `lfs getstripe` output for each file.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Modes

**Live scan** — type or browse to a directory on a Lustre client and click **scan**. The server walks
the tree (capped at 200k files / depth 24), runs `lfs getstripe --yaml <file>` on every regular file
with bounded parallelism (24 concurrent, 30s timeout each), and aggregates the results. `lfs` must be
on the host running the dev server.

**Demo data** — check “demo data” and click **load demo** to render a simulated 8-OST pool (raid0 +
PFL + mirrored layouts) without touching a filesystem. Useful on developer machines.

## What you get

- **Stats cards**: file/stripe totals, OSTs in use, total size, balance %, min/max components per OST
- **OST balance chart**: component counts per OST with gini, coefficient of variation, and the
  count-bytes correlation
- **Layouts histogram**: distribution of stripe layouts across the tree
- **Stripe map**: one row per file, one colored cell per OST holding at least one of its stripes;
  click a row for the drawer with per-stripe intervals, mirror ids, and the raw getstripe YAML
- **File table**: paged, path-filterable listing with size, layout, stripe count and OST list

## API

- `GET /api/health` -> `{ ok, lfs, mode }`
- `GET /api/browse?root=/lustre/...` -> `{ path, entries: [{ name, isDir }] }`
- `POST /api/scan` with `{ "root": "/lustre/dir", "mode": "live" | "demo" }` -> full `ScanPayload`
  (JSON). Live mode returns a friendly 501 with a hint when `lfs` is unavailable.

## Layout support

The parser (src/lib/parse.ts) is a tolerant, indent-based reader of `lfs getstripe --yaml` output:

- plain `raid0` files (`lmm_stripe_*` headers with per-stripe `stripe_offset` entries)
- progressive file layouts (PFL): `components:` entries with `start_extent`/`end_extent`
  (`end_extent: -1` is treated as open-to-EOF)
- mirrored / FLR layouts: `mirror_id` retained per stripe, `stripe_offset: -1` rows kept as *unplaced*
- legacy plain `ost>N: oid=... idx=...` output as a fallback

Unplaced stripes (OST -1) are kept in per-file data but excluded from per-OST tallies.

## Development

```bash
npm run lint     # eslint
npx tsc --noEmit # typecheck
npx vitest run   # parser unit tests
```
