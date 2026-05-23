# Research-Only Data Sources

> ⚠️ **COMMERCIAL-LICENSE TRIPWIRE** — Sources in this folder are licensed for
> research, training, and backtesting only. **They MUST NOT be used in
> revenue-generating live product flows.**

## What goes in this folder

Any data source whose license restricts commercial use. Today:

| Source | License | Allowed | Forbidden |
|---|---|---|---|
| `openMeteo.js` | Open-Meteo free tier | Research, model training, backtesting | Live serving once ads/affiliate go live |
| (future) StatsBomb open data | StatsBomb Public Data User Agreement | Research projects, methodology articles | Live engine dependency in a commercial product |
| (future) FBref via soccerdata | Sports Reference ToS | Limited research scraping | Bulk commercial use |

## What's NOT in this folder

Sources with permissive commercial licenses live in `services/` at the top level:

- `clubelo.js` — ClubElo is free for any use, attribution-only

## The tripwire — what triggers it

This restriction kicks in the moment **any** of the following becomes true:

- Display advertising goes live on the site
- Betting affiliate links are activated
- Any paid tier (Premium, API) launches
- Sponsored content runs

When that happens, every import from `services/sources/` becomes a license violation. Before flipping the commercial switch, audit `git grep "services/sources"` and either:

1. Replace each usage with a commercially-licensed alternative
2. Pay for the source's commercial tier (e.g. Open-Meteo Standard at ~€29/mo)
3. Remove the feature entirely

## Why we do it this way

Keeping research-only sources in a clearly named folder makes the line visible.
A grep across the codebase tells us exactly what needs replacing before launch.
The alternative — wiring restricted sources into `services/` alongside
commercially-safe ones — would mean we'd have to remember the difference, and
we won't.

## Adding a new source

1. Read the source's terms of use **before** writing code
2. If commercial use is restricted, file lives here
3. Add a banner comment at the top of the file with the license terms
4. Add a row to the table above
5. Add the source to the [[Engine Upgrade Plan]] under Data Sources with the
   correct commercial-use status
