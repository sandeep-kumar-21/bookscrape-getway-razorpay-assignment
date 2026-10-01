# bookscrape-gateway — Development Plan (v2, Redis-only)

> Hand this file to the IDE AI agent. Read **Section 0 (Agent Rules)** and **Section 2 (Site facts)** fully before writing any code, and follow them for the whole project.

**What changed from v1:** MongoDB removed. Redis is now both the cache and the data store. Added: atomic catalogue publishing, boot-time build with a "not ready" state, SSRF-safe id validation, Redis-down fallback, `X-Cache` header for testing, and a list of site gotchas found while cross-checking.

**v2.1:** Section 7 re-ordered into strict dependency order, with an exit gate per phase.

---

## 0. Agent Rules (non-negotiable)

### 0.1 How to work
1. **Small vertical slices.** One feature at a time: implement → test → lint/typecheck → commit. Never start the next feature while the previous one is red.
2. **Tests ship with the feature, not after.** A feature without passing tests is not done.
3. **Minimal, surgical changes.** Touch only the files the current task needs. No drive-by refactors, no reformatting unrelated files, no rewriting working code.
4. **Do not re-scaffold.** The NestJS project is already created by the owner. Do not run `nest new` or replace existing config/`package.json` wholesale. Add to it.
5. **No guessing, no fabrication.** Anything marked "verify" in Section 2 must be checked against a real saved HTML fixture before it is coded. If still unclear, ask.
6. **Verify before claiming done.** Run `lint`, `typecheck`, `test` and report the real output. Never say "should work".
7. **Ask when ambiguous.** Stop and ask one focused question instead of guessing.
8. **Keep the Progress checklist (Section 12) updated** after each phase.

### 0.2 Code quality
- TypeScript **strict** (`strict: true`, `noUncheckedIndexedAccess`). No `any` (use `unknown` + narrowing). No `!` non-null assertions without a comment explaining why.
- **Single responsibility.** Controllers: HTTP only. Services: business logic. Parsers: pure functions (HTML in → typed object out). Store: Redis access only. Transport/client: outbound HTTP only.
- **Dependency injection everywhere.** No `new Service()` inside classes, no hidden globals. This is what makes mocking easy.
- Query logic (filter / sort / search / paginate) is **pure functions** over arrays, separate from Redis and HTTP.
- Functions < ~40 lines, files < ~300 lines, one exported class per file, early returns over deep nesting.
- Naming: descriptive, no abbreviations. `camelCase` vars/functions, `PascalCase` classes/types, `kebab-case` files, `SCREAMING_SNAKE_CASE` constants.
- No magic values: selectors, URLs, TTLs, limits, timeouts live in typed constants or validated config.
- Comments explain *why*, not *what*. No dead code, no commented-out code, no stray `console.log` (use Nest `Logger`/pino).
- Immutability by default (`const`, `readonly`, never mutate inputs).

### 0.3 Architecture & modularity
- Feature modules with clear boundaries; export only what other modules need.
- Depend on **interfaces at the edges**: `HttpTransport` (outbound), `KeyValueStore` (Redis), injected via tokens. Business logic never imports `ioredis` or `fetch` directly.
- Shared code in `common/`, feature code in `modules/<feature>/`.
- Request/response DTOs for every endpoint. Never return raw parsed objects or raw Redis payloads — map to response DTOs.
- Versioned prefix `/api/v1`.

### 0.4 Error handling & resilience
- One global exception filter, one consistent error shape:
  ```json
  { "statusCode": 404, "error": "NotFound", "code": "BOOK_NOT_FOUND", "message": "Book 'x' was not found", "path": "/api/v1/books/x", "timestamp": "..." }
  ```
- Never leak stack traces, HTML or internal errors to clients.
- Status mapping: invalid input 400 · not found 404 · rate limited 429 · upstream failure 502 · upstream timeout 504 · catalogue not ready / store unavailable 503 (+ `Retry-After`) · unexpected 500.
- Outbound HTTP: timeout, bounded retries with exponential backoff + jitter (**only** on 5xx/network errors, never on 4xx), descriptive `User-Agent`.
- Parse failures are **explicit** `ParseError`s naming the failing field. Never silent `undefined`/`NaN`.

### 0.5 Being a good citizen to the source site
- Only public pages; no login; no bypassing anything.
- Check and respect `robots.txt` (record the finding in `docs/SITE_ANALYSIS.md`).
- Max outbound concurrency 2, small delay between requests, `User-Agent` with repo/contact URL.
- Never crawl per request. A crawl runs only: (a) via `pnpm sync`, or (b) once on boot **only if** no catalogue exists and `AUTO_SYNC_ON_BOOT=true`, guarded by a lock.
- Our API must not become an open proxy: only ids present in the synced catalogue may trigger an upstream fetch.

### 0.6 Security & config
- Env-driven config validated at startup (fail fast, clear message). Provide `.env.example`. Never commit `.env`.
- `helmet`, global validation (whitelist + forbid unknown), body size limit, `@nestjs/throttler`.
- **Validate every param.** The book `id` is used to build an upstream URL → strict regex `^[a-z0-9-]+_\d+$` (no slashes, dots, schemes) to prevent path traversal/SSRF. Cap `limit`. Cap and normalize `q`.
- No secrets, tokens or personal data in code, logs or fixtures.

### 0.7 Testing standards (Vitest)
- Pyramid: many **unit** tests (parsers, query functions, services with fakes, transport), some **integration** tests (Redis store against a real Redis), a small **e2e** suite (HTTP via supertest against the Nest app, with a fixture-backed transport so it is offline and deterministic).
- Parsers are tested against **real saved HTML fixtures** in `test/fixtures/`. Unit/e2e tests never hit the live site.
- Redis integration/e2e tests use an isolated DB index (`REDIS_DB=15`) and a test key prefix; flush that DB between tests. Never touch the dev DB.
- Tests are deterministic and order-independent. Name tests as behaviour: `it('returns 404 when the book is not in the catalogue')`.
- Cover happy path **and** edge cases: empty results, invalid params, last page, page beyond last, upstream timeout, malformed HTML, cache hit vs miss, Redis down, catalogue not ready.
- Coverage ≥ 80% lines overall, ≥ 90% on parsers, query functions and services. Assert behaviour, not implementation.
- Never skip or delete a failing test to get green. Fix the cause.

### 0.8 Git & process
- **Conventional Commits** (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`), one logical change per commit, imperative mood.
- Feature branches merged to `main` only when checks pass. Pre-commit hooks (husky + lint-staged + commitlint). CI runs lint + typecheck + unit + e2e (Redis as a service container).
- Keep the README current as you go.

### 0.9 Definition of Done (per feature)
- [ ] Implemented, typed, no `any`
- [ ] Unit tests passing; integration/e2e where applicable
- [ ] Error cases handled **and tested**
- [ ] Lint + typecheck clean
- [ ] Swagger decorators updated
- [ ] README/docs updated if behaviour or setup changed
- [ ] Committed with a conventional commit message

---

## 1. Project Overview

**Name:** `bookscrape-gateway`

**Goal:** a clean, documented JSON REST API for **https://books.toscrape.com**, a practice site that serves only HTML and has no public API. The service crawls public pages, parses them into typed data, stores them in Redis, and serves them through well-designed endpoints.

**Deliverables (from the assignment):**
1. A working API.
2. A **test script** that exercises the relevant cases against the running API (`scripts/api-check.ts`).
3. A **short note on limitations and the proper long-term fix** (`docs/LIMITATIONS.md`).

**Data flow**
```
Client ─▶ Nest API ─▶ in-process snapshot (≤60s) ─▶ Redis (cache + store)
                                                        ▲
                         sync (crawl) / lazy detail ────┘
                                  │
                       Parser (pure) ◀─ HttpTransport ◀─ books.toscrape.com
```

**Key design decisions**
- **Catalogue** (1,000 summaries + categories) is built by a crawl and stored as **one Redis key**, published **atomically** (write temp key → `RENAME`). Readers never see a half-built catalogue.
- **List / filter / sort / search** run in memory (plain TypeScript) over the catalogue. For 1,000 items this takes milliseconds.
- **Book detail** is scraped lazily on first request, then cached in Redis with a TTL.
- **Not ready state:** if the catalogue does not exist yet, data endpoints return `503` + `Retry-After`, and `/health` reports the build status. No endpoint ever blocks on a crawl.
- **Redis-down behaviour:** serve the last in-process snapshot (`X-Cache: STALE`) if one exists; otherwise `503`.

---

## 2. Site facts (cross-checked)

Facts below were confirmed from multiple public tutorials/repos describing the site, and cross-verified against real HTML/screenshots provided by the user. Items marked **Confirmed (HTML / Screenshot Verified)** have been verified directly against user-provided HTML and screenshots.

| Fact | Status |
|---|---|
| 1,000 books, 20 per page, 50 listing pages | Confirmed (public sources & screenshot) |
| Listing URLs: `/` (page 1) and `/catalogue/page-N.html`; `/catalogue/page-1.html` also works | Confirmed |
| Book URL: `/catalogue/{slug}_{number}/index.html`, e.g. `unicorn-tracks_951` | Confirmed |
| Book cards are `article.product_pod`; title in `h3 a[title]`; price in `p.price_color` | Confirmed |
| **Relative hrefs differ by page**: on `/` they look like `catalogue/x_1/index.html`, on `/catalogue/page-N.html` like `x_1/index.html` | Confirmed (known trap). **Always resolve with `new URL(href, currentPageUrl)`** and always crawl `/catalogue/page-N.html` |
| **Visible title text is truncated** with `...`; the full title is in the `title` attribute | Confirmed (HTML / Screenshot Verified: `<a href="..." title="A Light in the Attic">A Light in the ...</a>`) |
| Rating is a CSS class on `p.star-rating` (`One`…`Five`) | Confirmed (HTML / Screenshot Verified: `<p class="star-rating Three">`) |
| Category pages: `/catalogue/category/books/{name}_{n}/index.html`; paginated as `page-2.html` inside the category folder (not `?page=`) | Confirmed (HTML Verified: sidebar hrefs `catalogue/category/books/{name}_{n}/index.html`) |
| The sidebar also contains a top-level **"Books"** entry (`books_1`) that holds all 1,000 books. **Exclude it** from the category list or every book gets category "Books" | Confirmed (HTML Verified: `books_1` is parent category list, 50 actual categories nested under it from `travel_2` to `crime_51`) |
| Listing cards show only "In stock"; the **count** ("In stock (22 available)") exists only on the detail page | Confirmed (HTML / Screenshot Verified: listing has only `In stock`, detail has `In stock (22 available)` in both info paragraph and table) |
| Detail page has a product table (UPC, Product Type, Price excl./incl. tax, Tax, Availability, Number of reviews) and a breadcrumb with the category | Confirmed (HTML Verified: table with `UPC`, `Product Type`, `Price (excl. tax)`, `Price (incl. tax)`, `Tax`, `Availability`, `Number of reviews`; breadcrumb `Home > Books > Poetry > A Light in the Attic`) |
| Some books have **no description** paragraph | Verify against fixtures → `description` is nullable (`string | null`) |
| Page 1 shows a total like "1000 results"; used as a completeness check | Confirmed (HTML / Screenshot Verified: `<strong>1000</strong> results - showing <strong>1</strong> to <strong>20</strong>.`) |
| Currency symbol can appear mangled (`Â£`) if decoded with the wrong charset | Always decode as UTF-8; extract the number with a regex `([0-9]+\.[0-9]{2})`, never rely on the symbol |
| `robots.txt` content | Verify and record in Phase 1 |

---

## 3. Tech Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js ≥ 20 (built-in `fetch`/`undici`); add `.nvmrc` |
| Framework | NestJS 12 (scaffolded), TypeScript strict (NodeNext ESM) |
| Package manager | npm (scaffold default with `package-lock.json`), compatible with pnpm |
| HTTP | built-in `fetch` with `AbortSignal.timeout`, behind an `HttpTransport` interface |
| HTML parsing | `cheerio` |
| Store / cache | Redis via `ioredis`, behind a `KeyValueStore` interface |
| Validation | `class-validator` + `class-transformer`; env validated with `zod` |
| API docs | `@nestjs/swagger` |
| Security | `helmet`, `@nestjs/throttler` (in-memory storage for single instance) |
| Logging | `nestjs-pino` |
| Health | custom health controller reporting Redis & catalogue status |
| Concurrency | `p-limit` + fixed delay |
| Testing | **Vitest** (already in scaffold), `supertest`; real Redis (docker) for integration/e2e |
| Quality | oxlint (already in scaffold), Prettier, husky, lint-staged, commitlint |
| Local infra | **Standalone Reusable Redis**: `docker-compose.redis.yml` (`redis` container on `6379`, persistent named volume `redis_data`), usable across multiple projects |

> **Vitest + NestJS note:** Vitest 4 with `vite-tsconfig-paths` is already working in the scaffold. Two test configs are maintained: `vitest.config.ts` (unit tests) and `vitest.config.e2e.ts` (integration/e2e tests: longer timeout, runs against isolated Redis DB 15).

---

## 4. Target Folder Structure

```
bookscrape-gateway/
├─ src/
│  ├─ main.ts
│  ├─ app.module.ts
│  ├─ common/
│  │  ├─ config/             # env schema + typed config
│  │  ├─ errors/             # custom errors + global exception filter
│  │  ├─ http/               # HttpTransport interface + FetchTransport, ScraperClient
│  │  ├─ store/              # KeyValueStore interface + RedisStore, in-memory fake
│  │  ├─ dto/                # pagination DTOs
│  │  └─ utils/              # normalize text, url helpers
│  └─ modules/
│     ├─ catalogue/          # CatalogueService (snapshot + store), pure query fns
│     ├─ books/              # controller, service, DTOs, parsers/
│     ├─ categories/         # controller, DTOs, parser
│     ├─ sync/               # SyncService, lock, status, CLI entry, boot hook
│     └─ health/
├─ test/
│  ├─ fixtures/              # real saved HTML pages
│  ├─ support/               # FixtureTransport, redis test helpers
│  └─ e2e/
├─ scripts/api-check.ts      # the assignment's test script
├─ docs/{LIMITATIONS.md, SITE_ANALYSIS.md}
├─ docker-compose.redis.yml  # standalone, reusable Redis container for all projects
├─ docker-compose.yml        # optional full-stack compose
├─ .env.example  .nvmrc
├─ vitest.config.ts  vitest.config.e2e.ts
└─ README.md
```

---

## 5. Redis Data Model & Reusable Container Strategy

### 5.1 Standalone Reusable Redis Container Strategy
To allow the Redis instance to be shared across multiple projects without collision or tight project coupling:
- **Dedicated Compose File**: `docker-compose.redis.yml` runs a standalone container named `redis` (image: `redis:7-alpine`) on host port `6379:6379`.
- **Persistent Storage**: Uses a global named volume `redis_data` with `--appendonly yes`, so cached and stored data survives container restarts and reboots.
- **Multi-Project Isolation**:
  - `bookscrape-gateway` (dev): uses logical database index `0` (`REDIS_DB=0`) and key namespace prefix `bsg:v1:`.
  - `bookscrape-gateway` (test/e2e): uses logical database index `15` (`REDIS_DB=15`) with prefix `bsg:test:`, completely isolated from dev.
  - Other projects: can freely use `localhost:6379` with other DB numbers (`REDIS_DB=1`, `REDIS_DB=2`, etc.) and their own namespace prefixes.
- **Standalone Management**:
  - Start container: `npm run redis:up` (or `docker compose -f docker-compose.redis.yml up -d`)
  - Stop container: `npm run redis:down` (or `docker compose -f docker-compose.redis.yml stop`)
  - Check status: `npm run redis:status`

### 5.2 Key Schema
All keys for this application are prefixed `bsg:v1:`.

| Key | Value | TTL | Notes |
|---|---|---|---|
| `catalogue` | JSON `{ builtAt, sourceTotal, books: BookSummary[], categories: Category[] }` (~300 KB) | none | Replaced **atomically**: `SET catalogue:tmp` then `RENAME` over `catalogue` |
| `book:{id}` | JSON `BookDetail` | `DETAIL_TTL_SECONDS` (default 7 days) | Written on first detail request |
| `sync:status` | JSON `{ state: 'idle'\|'building'\|'ready'\|'failed', startedAt, finishedAt, error? }` | none | Read by `/health` |
| `lock:sync` | random token | `SYNC_LOCK_TTL_SECONDS` (default 900) | `SET NX EX`; release **only if the token matches** (Lua compare-and-delete) |

Rules:
- Redis is persistent in docker (`--appendonly yes` + named volume `redis_data`), but the app must still cope with an empty Redis by rebuilding.
- A failed or partial crawl **never** overwrites an existing good catalogue.
- Single-flight per detail id in-process (a map of in-flight promises) so 10 simultaneous requests cause one upstream fetch.

---

## 6. API Specification

Base path `/api/v1`. Swagger UI at `/docs`.

| Method | Path | Description |
|---|---|---|
| GET | `/books` | Paginated list. Query: `page` (≥1, default 1), `limit` (1–50, default 20), `category` (name or id, case-insensitive), `minPrice`, `maxPrice` (`minPrice ≤ maxPrice`), `rating` (1–5), `inStock` (bool), `sort` (`default`\|`title`\|`price`\|`rating`), `order` (`asc`\|`desc`) |
| GET | `/books/search?q=` | Title search. `q` trimmed, 2–100 chars. Paginated |
| GET | `/books/:id` | Full detail. `id` must match `^[a-z0-9-]+_\d+$` |
| GET | `/categories` | Categories with book counts (derived from the catalogue) |
| GET | `/health` | Always 200 if the process is up; body reports Redis status and catalogue status |

**Behaviour decisions (implement and test exactly these):**
- `sort=default` keeps the **site's own order** (store a `position` index). `GET /books?page=1` must match the site's page 1, which makes correctness easy to verify.
- Sorting is stable with `id` as the tiebreaker.
- Page beyond the last → `200` with `data: []` and correct `meta`.
- Unknown `category` → `400` (`UNKNOWN_CATEGORY`). Invalid `minPrice > maxPrice`, `page=0`, `limit>50`, `rating=9`, short/long `q` → `400`.
- Search: lowercase, strip diacritics, collapse whitespace, tokens combined with AND over the title; rank exact > prefix > contains, then title ascending. Description is **not** searched (it exists only on detail pages) — document this.
- Detail for an id **not in the catalogue** → `404` without any upstream call. If the catalogue is not ready → `503`.
- Every data response carries `X-Cache: HIT | MISS | STALE`. `MISS` means the detail page was scraped for this request. This makes cache behaviour testable without timing.
- Catalogue not ready → `503`, `Retry-After: 10`, code `CATALOGUE_NOT_READY`.

**Paginated response**
```json
{ "data": [ ... ], "meta": { "page": 1, "limit": 20, "total": 1000, "totalPages": 50 } }
```

**BookSummary:** `id, position, title, price, currency, rating, inStock, category, imageUrl, sourceUrl`
**BookDetail:** summary + `description (nullable), stockCount, upc, productType, priceExclTax, priceInclTax, tax, numberOfReviews, scrapedAt`

**Normalization:** `price` number (regex extract, not symbol-dependent), `currency: "INR"`; `rating` integer 1–5; `stockCount` integer; all URLs absolute; `id` = slug from the book URL. A selector that finds nothing → `ParseError` with the field name.

---

## 7. Phased Implementation Plan

> **Strict order.** Do the phases top to bottom. Never start Phase N+1 until Phase N's **exit gate** passes. Every phase ends with a commit and a tick in Section 12. "Depends on" lists the real dependencies, so nothing is built before the things it needs.

### Order at a glance

| # | Phase | Produces | Depends on |
|---|---|---|---|
| 0 | Owner setup (done by you, not the agent) | NestJS scaffold, repo, Node + Docker installed | — |
| 1 | Site analysis & fixtures | Verified site facts, real HTML fixtures | 0 |
| 2 | Tooling & quality gates | Vitest, lint, hooks, CI, Redis in docker | 0 |
| 3 | Config, errors, app bootstrap | Validated config, error filter, `configureApp()` | 2 |
| 4 | Domain types & parsers | Typed models, pure parsers | 1, 3 |
| 5 | Outbound HTTP layer | `HttpTransport`, `ScraperClient`, `FixtureTransport` | 3 |
| 6 | Redis store layer | `KeyValueStore`, `RedisStore`, in-memory fake | 2, 3 |
| 7 | Query engine & catalogue service | filter / sort / search / paginate, `CatalogueService` | 4, 6 |
| 8 | Sync | Crawl, atomic publish, lock, status, CLI, boot build | 4, 5, 6, 7 |
| 9 | E2E harness, health, categories | `createTestApp()`, `/health`, `/categories` | 3, 7, 8 |
| 10 | Books list & search | `GET /books`, `GET /books/search` | 9 |
| 11 | Book detail | `GET /books/:id`, lazy scrape, single-flight | 10 |
| 12 | Hardening | Throttling, request ids, failure drills | 11 |
| 13 | Assignment test script | `pnpm api:check` | 12 |
| 14 | Documentation & one-command run | README, LIMITATIONS, Dockerfile | 13 |
| 15 | Final QA & submission | Clean-clone run, acceptance checklist | 14 |
| 16 | Stretch (optional) | quotes endpoint | 15 |

**Why this order**
1. Facts before code: site analysis first, because a surprise (robots.txt, different markup) would change everything after it.
2. Tooling and bootstrap before features, so every later phase has tests, lint and error handling from its first line.
3. Pure code (parsers, query functions) before I/O code (HTTP, Redis), because pure code is the easiest to test and has no setup.
4. Writers before readers: the sync (which fills Redis) comes before any endpoint that reads from it.
5. Simple endpoints before complex ones: health and categories, then list and search, then detail (the most complex).
6. Hardening, the test script and docs come after the features they describe.

---

### Phase 0 — Owner setup (you, not the agent)
- **Tasks:** `nest new bookscrape-gateway` (pnpm), `git init` + first commit, create the GitHub repo and push, make sure Node ≥ 20 and Docker are installed.
- **Exit gate:** `pnpm start` runs the default Nest app; repo is pushed.

### Phase 1 — Site analysis & fixtures (no application code)
- **Depends on:** 0
- **Goal:** replace assumptions with facts before writing any code.
- **Tasks (in order):**
  1. Fetch `robots.txt` and record it. If crawling looks disallowed or unclear, **stop and ask**.
  2. Fetch pages politely with `curl`: descriptive `User-Agent`, at least 1 second between requests, only the pages listed in step 4 (about a dozen requests total).
  3. Resolve every row marked **verify** in Section 2 and write the findings in `docs/SITE_ANALYSIS.md`: URL patterns, selector per field, rating encoding, exact "results" total text, category pagination, the top-level "Books" category, charset behaviour.
  4. Save fixtures in `test/fixtures/`: homepage, `page-2`, last page (`page-50`), page with the category sidebar, one category page plus page 2 of a multi-page category, 3 detail pages (different ratings; one with no description; one with a different stock count), a 404 page, and one deliberately broken page.
  5. Record the number of categories and which category is multi-page.
- **Tests:** none.
- **Exit gate:** every **verify** row is marked confirmed or corrected with fixture evidence; the `robots.txt` finding is recorded; fixtures are committed; zero application code added.
- **Commit:** `docs: add site analysis and html fixtures`

### Phase 2 — Tooling & quality gates
- **Depends on:** 0
- **Tasks (in order):**
  1. Leverage existing Vitest & oxlint scaffold. Ensure `@vitest/coverage-v8`, `@types/supertest`, `supertest` are configured. Add `test/setup.ts`.
  2. Maintain `vitest.config.ts` (unit: `src/**/*.spec.ts`) and `vitest.config.e2e.ts` (`test/**/*.e2e-spec.ts`, 30s timeout, runs against isolated Redis DB 15).
  3. Strict TypeScript flags, oxlint + Prettier, npm scripts from Section 9.
  4. husky + lint-staged + commitlint (Conventional Commits).
  5. `.nvmrc`, `.editorconfig`, `.gitignore` (`.env`, `coverage`, `dist`).
  6. `docker-compose.redis.yml` for standalone reusable Redis container (`redis`, port `6379:6379`, persistent volume `redis_data`, `--appendonly yes`). Wire npm scripts `redis:up`, `redis:down`, `redis:status`. Add `.env.example` (Section 8).
  7. CI workflow: Node 20, Redis service container; steps lint, typecheck, unit, e2e.
  8. Smoke spec proving DI and decorators work under Vitest (a tiny provider via `Test.createTestingModule`).
- **Exit gate:** `lint`, `typecheck`, `test` pass (including the DI smoke spec); `docker compose -f docker-compose.redis.yml up -d` works and Redis replies to ping; a non-conventional commit message is rejected.
- **Commit:** `chore: set up vitest, lint, hooks, ci and reusable redis compose`

### Phase 3 — Config, errors, app bootstrap
- **Depends on:** 2
- **Tasks (in order):**
  1. Typed config module for every variable in Section 8, schema-validated, fail-fast. Nothing outside this module reads `process.env`.
  2. Error classes with `code` and status: `NotFoundError`, `ValidationError`, `ParseError`, `UpstreamError`, `UpstreamTimeoutError`, `CatalogueNotReadyError`, `StoreUnavailableError`.
  3. Global exception filter producing the shape from 0.4.
  4. `configureApp(app)`: validation pipe (whitelist, forbidNonWhitelisted, transform), helmet, `/api/v1` prefix, Swagger at `/docs`, pino logger, shutdown hooks, the exception filter. Used by `main.ts` **and** by tests, so e2e runs the same pipeline as production.
- **Tests:** config valid / missing / invalid; each error maps to the right status, code and shape; unknown route returns the standard 404 shape.
- **Exit gate:** app boots with `.env.example`; `/docs` loads; a bad env value fails at startup with a clear message.
- **Commit:** `feat: add validated config, error model and app bootstrap`

### Phase 4 — Domain types & parsers (pure)
- **Depends on:** 1, 3
- **Tasks (in order):**
  1. Shared types: `BookSummary`, `BookDetail`, `Category`, `Rating`.
  2. Pure helpers: `resolveUrl`, `extractBookId` (id regex), `parsePrice`, `parseRating`, `parseStockCount`.
  3. `parseListingPage(html, pageUrl)` → `{ items, nextUrl | null, totalResults | null }` (full title from the attribute, URLs resolved against `pageUrl`).
  4. `parseCategoryIndex(html, pageUrl)` → `Category[]` (excludes the top-level "Books").
  5. `parseCategoryPage(html, pageUrl)` → `{ bookIds, nextUrl | null }`.
  6. `parseBookDetail(html, pageUrl)` → `BookDetail`.
- **Tests (real fixtures):** every field; rating 1–5; price with a mangled `Â£`; stock count; truncated title; missing description → `null`; homepage and `page-2` hrefs resolve to identical id/URL shapes; last page → `nextUrl = null`; broken page → `ParseError` naming the field.
- **Exit gate:** every Phase 1 fixture parses; parser coverage ≥ 90%; parsers import nothing from Nest or any I/O.
- **Commits:** one per parser, `feat(parsers): ...`

### Phase 5 — Outbound HTTP layer
- **Depends on:** 3
- **Tasks (in order):**
  1. `HttpTransport` interface + injection token; `FetchTransport` (UTF-8 decoding, `AbortSignal.timeout`, `User-Agent`).
  2. `ScraperClient.getHtml(pathOrUrl)`: refuses any host other than `SOURCE_BASE_URL` (defence in depth against SSRF), concurrency cap, delay, retry with backoff + jitter on 5xx/network errors only, 404 → `NotFoundError`, other failures → `UpstreamError` / `UpstreamTimeoutError`.
  3. `test/support/fixture-transport.ts`: an `HttpTransport` that serves HTML from a fixtures directory by URL path, returns 404 for unknown paths, records every request (so tests can assert call counts), and can be told to fail or time out for chosen paths.
- **Tests:** success, 404, 500-then-success, retries exhausted, timeout, no retry on 4xx, concurrency cap respected, backoff bounded, foreign host rejected, `FixtureTransport` basics.
- **Exit gate:** all green with no live network access.
- **Commit:** `feat(http): add transport, scraper client and fixture transport`

### Phase 6 — Redis store layer
- **Depends on:** 2, 3
- **Tasks (in order):**
  1. `KeyValueStore` interface + token: `getJson`, `setJson(ttl?)`, `del`, `rename`, `setNx(ttl)`, `compareAndDelete(key, token)`, `ping`.
  2. `RedisStore` on `ioredis`: key prefix, DB index, bounded retries and a command timeout so a dead Redis fails fast with `StoreUnavailableError` instead of hanging; closes on shutdown.
  3. `InMemoryStore` fake in `test/support/` implementing the same interface.
  4. One shared **contract test suite** run against both implementations.
- **Tests (integration, `REDIS_DB=15`):** round trip, TTL expiry, `rename` replaces atomically, `setNx` contention, `compareAndDelete` with the wrong token does nothing, Redis down → `StoreUnavailableError` quickly.
- **Exit gate:** contract suite green for both the real store and the fake.
- **Commit:** `feat(store): add redis store with contract tests`

### Phase 7 — Query engine & catalogue service
- **Depends on:** 4, 6
- **Tasks (in order):**
  1. `normalizeText` (lowercase, strip diacritics, collapse whitespace).
  2. Pure `filterBooks`, `sortBooks` (default / title / price / rating, stable with `id` tiebreak), `searchBooks` (tokens AND, rank exact > prefix > contains, then title), `paginate`: exactly the rules in Section 6.
  3. Category resolver: accepts a category name or id, case-insensitive; unknown → signals `UNKNOWN_CATEGORY`.
  4. `CatalogueService.getCatalogue()`: in-process snapshot (≤ `SNAPSHOT_TTL_SECONDS`) → Redis → `CatalogueNotReadyError`. Serves the stale snapshot if Redis fails. Reports where the data came from (`snapshot` / `redis` / `stale`) for `X-Cache`. `invalidateSnapshot()` is called after a publish.
- **Tests:** combined filters; stable sort; search ranking and diacritics; pagination edges (page beyond last, limit bounds); service states: ready, not ready, Redis down with snapshot, Redis down without snapshot.
- **Exit gate:** query-function and service coverage ≥ 90%.
- **Commit:** `feat(catalogue): add query engine and catalogue service`

### Phase 8 — Sync (writer)
- **Depends on:** 4, 5, 6, 7
- **Tasks (in order):**
  1. **Mini-site fixtures first** (`test/fixtures/mini-site/`): a small, internally consistent copy of the site built from the real markup: 3 listing pages (about 5 books each, last page without a next link), the category index, 3 category pages (one spanning 2 pages), 5 detail pages, and a "results" total that matches the book count.
  2. `SyncLock` (`setNx` + token-checked release) and `SyncStatusService` (reads/writes `sync:status`).
  3. `SyncService.build()`: acquire lock → walk `/catalogue/page-N.html` via `nextUrl` → crawl categories (skip the top-level "Books") to assign categories → check `books.length === sourceTotal` and every id matches the id regex → write `catalogue:tmp` → `rename` to `catalogue` → invalidate snapshot → status `ready` → release lock in `finally`.
  4. **Failure policy:** fail-fast. Any unrecoverable page failure aborts, sets status `failed`, and leaves the old catalogue untouched. A book not found in any category gets `category: null` and a logged warning; the build still succeeds.
  5. CLI entry `src/sync/cli.ts` using `NestFactory.createApplicationContext`, wired to `pnpm sync`; non-zero exit code on failure.
  6. Boot hook (`OnApplicationBootstrap`): if `AUTO_SYNC_ON_BOOT=true`, no catalogue exists and the lock is free, start `build()` **without awaiting** it. It must never throw into bootstrap.
- **Tests:** crawl stops when `nextUrl` is null; count mismatch aborts without publishing; concurrent second build refused by the lock; lock released on failure; old catalogue survives a failed rebuild; rebuild is idempotent; uncategorised book gets `category: null`; boot hook skips when a catalogue already exists.
- **Manual check (run once, politely):** `pnpm sync` against the real site gives 1,000 books, category counts sum to 1,000, every id matches the id regex, status is `ready`.
- **Exit gate:** tests green **and** the manual real-site check passes.
- **Commits:** `test: add mini-site fixtures`, `feat(sync): ...`

### Phase 9 — E2E harness, health, categories
- **Depends on:** 3, 7, 8
- **Tasks (in order):**
  1. `test/support/create-test-app.ts`: builds the Nest app with `configureApp`, overrides `HttpTransport` with `FixtureTransport(mini-site)`, uses Redis DB 15 and a test prefix, disables boot sync and throttling, flushes the DB, and can run `SyncService.build()` once.
  2. `GET /health`: Redis ping, sync status, catalogue summary (`ready | building | missing | failed`, `total`, `builtAt`). Always 200 while the process is up.
  3. `GET /categories`: names, ids and counts from the catalogue, sorted by name.
  4. DTOs + Swagger.
- **Tests (e2e):** health in each state (missing, building, ready, failed, Redis down); category counts sum to the catalogue total; not ready → `503` + `Retry-After` + `CATALOGUE_NOT_READY`.
- **Exit gate:** the harness is reusable by later phases; e2e is green and fully offline.
- **Commit:** `feat: add e2e harness, health and categories endpoints`

### Phase 10 — Books list & search
- **Depends on:** 9
- **Tasks (in order):**
  1. `ListBooksQueryDto`: validation for every param (including `minPrice ≤ maxPrice`, `inStock` boolean transform); unknown `category` → `400 UNKNOWN_CATEGORY`.
  2. `GET /books` on top of the query engine, with the `X-Cache` header.
  3. `SearchBooksQueryDto` + `GET /books/search`. **Declare the `search` route before any `:id` route**, otherwise Nest treats "search" as an id.
  4. Response mappers and Swagger examples.
- **Tests (e2e + unit):** every behaviour in Section 6; default order equals fixture order; stable sort; page beyond last → `200` with `data: []`; each invalid param → 400 with the standard shape.
- **Manual check:** with real synced data, `GET /books?page=1` shows the same titles, in the same order, as the site's page 1.
- **Exit gate:** tests green and the manual check passes.
- **Commits:** `feat(books): add list endpoint`, `feat(books): add search endpoint`

### Phase 11 — Book detail
- **Depends on:** 10
- **Tasks (in order):**
  1. `BookIdPipe`: regex `^[a-z0-9-]+_\d+$` → `400 INVALID_BOOK_ID`.
  2. `BookDetailService.get(id)`: catalogue lookup (not found → 404, not ready → 503) → Redis detail key (`HIT`) → in-process single-flight scrape → parse → merge with the catalogue summary (log a warning if the breadcrumb category disagrees) → `setJson` with TTL (a cache write failure is logged, not fatal) → `MISS`. If Redis is down, scrape directly without caching.
  3. `GET /books/:id` (declared after `search`), mapper, Swagger.
- **Tests (e2e + unit):** HIT vs MISS via `X-Cache`; unknown id → 404 with **zero** upstream calls; malicious ids (`../x`, `http://evil`, encoded slashes) → 400; 10 concurrent requests for one id → exactly one upstream call; upstream 500 → 502; timeout → 504; not ready → 503; Redis down → still served, uncached.
- **Manual check:** compare one detail response with its real page by eye.
- **Exit gate:** tests green, manual check passes.
- **Commit:** `feat(books): add detail endpoint with lazy scrape`

### Phase 12 — Hardening
- **Depends on:** 11
- **Tasks (in order):**
  1. Global throttler (`/health` excluded); the 429 goes through the exception filter.
  2. Request-id middleware with pino correlation; sensible log levels; no stack traces in responses.
  3. Graceful shutdown: close Redis; an in-flight sync releases its lock.
  4. **Failure drills** (run manually, then describe in the README under "Failure behaviour"): stop Redis mid-run; block the network to the site; kill a sync mid-build and confirm the old catalogue survives and the lock expires; restart with an empty Redis.
- **Tests:** 429 behaviour; degraded paths (store failing, upstream failing); shutdown releases the lock.
- **Exit gate:** every drill behaves as specified in Section 6 and Section 10.
- **Commit:** `feat: add throttling, request ids and graceful shutdown`

### Phase 13 — Assignment test script
- **Depends on:** 12
- **Tasks:** build `scripts/api-check.ts` (`pnpm api:check`, optional `--base-url`) that hits the **running** API, prints clear pass/fail lines, and exits non-zero on any failure. It **discovers** data and never hardcodes a book:
  - Poll `/health` until `catalogue.status === 'ready'` (with a timeout and a clear message).
  - `GET /books?page=1` → 20 items, correct `meta`, documented shape.
  - Take `items[0].id` → `GET /books/:id` returns all expected fields with the right types.
  - Repeat that call → `X-Cache: HIT` (assert the header, not timing).
  - Pagination: last page has the remainder; page beyond last → empty `data`.
  - Filters (`category`, price range, `rating`, `inStock`) return only matching items.
  - Search: a query built from a real title finds it; a nonsense query returns `[]`.
  - Errors: unknown id → 404; `page=0`, `limit=1000`, `rating=9`, `minPrice>maxPrice`, malicious id → 400 with the standard error shape.
  - `GET /categories` is non-empty and counts sum to the total.
  - Final summary: `N passed, M failed`.
- **Exit gate:** passes against a running instance on real data, and returns a non-zero exit code when pointed at a stopped server.
- **Commit:** `feat: add api-check script`

### Phase 14 — Documentation & one-command run
- **Depends on:** 13
- **Tasks (in order):**
  1. **README:** what it is, architecture diagram, prerequisites, setup in ≤ 5 commands, env table, how to sync, how to run tests and `api:check`, `curl` examples, design decisions, `AUTO_SYNC_ON_BOOT` behaviour, "Failure behaviour" from Phase 12.
  2. **docs/LIMITATIONS.md** (short, honest):
     - Depends on the site's HTML; a redesign breaks selectors (parsers are isolated and fixture-tested so fixes are quick).
     - No SLA; availability and speed depend on the source site.
     - Data is stale between syncs; refresh is explicit.
     - Redis is not a durable database; the catalogue can be rebuilt, but a flush means a rebuild window with `503`s.
     - Search covers titles only; descriptions exist only after a detail fetch.
     - Politeness limits (concurrency, delay) cap how fast data can be refreshed.
     - **Long-term fix:** ask the site owner for an official API or data-sharing agreement (or a sanctioned feed/sitemap export), then replace the transport/scraper with the official client behind the same interfaces so this service's public API does not change.
  3. Finalize `docs/SITE_ANALYSIS.md`.
  4. Multi-stage `Dockerfile` (non-root user) + compose service for the app with a healthcheck, so `docker compose up` gives a working API.
  5. Swagger review: every endpoint, param, error and example is accurate.
- **Exit gate:** in a fresh directory, following only the README, the API comes up and `api:check` passes within about 5 minutes.
- **Commit:** `docs: add readme, limitations note and docker setup`

### Phase 15 — Final QA & submission
- **Depends on:** 14
- **Tasks (in order):**
  1. Run lint, typecheck, unit, e2e and coverage; enforce the coverage thresholds in the Vitest config.
  2. Dry run from a clean clone (fresh container or machine).
  3. Walk the Section 11 checklist and fix every gap.
  4. Repo hygiene: no secrets, no personal data in fixtures, `.env.example` present, tidy history, tag `v1.0.0`.
  5. Write a short submission note: what was built, how to run it, link to `LIMITATIONS.md`.
- **Exit gate:** every box in Section 11 is ticked.

### Phase 16 — Stretch (optional)
- **Depends on:** 15 (only start when everything above is green)
- **Tasks:** add a small `quotes` module for quotes.toscrape.com's JavaScript/infinite-scroll variant. In DevTools → Network → Fetch/XHR, find the JSON endpoint the page itself calls, document it in `SITE_ANALYSIS.md`, and wrap it as `GET /quotes?page=`. Verify the endpoint in the browser first rather than assuming.
- **Exit gate:** same Definition of Done as every other feature (0.9).

---

## 8. Configuration Reference (`.env.example`)

```
PORT=3000
NODE_ENV=development
REDIS_URL=redis://localhost:6379
REDIS_DB=0
KEY_PREFIX=bsg:v1:
SOURCE_BASE_URL=https://books.toscrape.com
USER_AGENT=bookscrape-gateway/1.0 (+https://github.com/<your-username>/bookscrape-gateway)
HTTP_TIMEOUT_MS=10000
HTTP_MAX_RETRIES=3
HTTP_CONCURRENCY=2
HTTP_DELAY_MS=300
DETAIL_TTL_SECONDS=604800
SNAPSHOT_TTL_SECONDS=60
SYNC_LOCK_TTL_SECONDS=900
AUTO_SYNC_ON_BOOT=true
THROTTLE_TTL=60
THROTTLE_LIMIT=100
```
Tests use `REDIS_DB=15` and a separate key prefix.

---

## 9. npm Scripts (target)

```
dev          nest start --watch
build        nest build
start:prod   node dist/main
lint         oxlint src/ test/
format       prettier --write .
typecheck    tsc --noEmit
test         vitest run
test:watch   vitest
test:cov     vitest run --coverage
test:e2e     vitest run -c vitest.config.e2e.ts
sync         run the catalogue build (forces a rebuild)
api:check    run scripts/api-check.ts against the running API
redis:up     docker compose -f docker-compose.redis.yml up -d
redis:down   docker compose -f docker-compose.redis.yml stop
redis:status docker compose -f docker-compose.redis.yml ps
```

---

## 10. Edge Cases the Implementation Must Handle (cross-check log)

| Risk | Handling |
|---|---|
| Different relative hrefs on `/` vs `/catalogue/page-N.html` | Resolve with `new URL(href, pageUrl)`; always crawl `/catalogue/page-N.html`; fixtures for both |
| Truncated titles in listing cards | Read the `title` attribute |
| Top-level "Books" category contains everything | Exclude it |
| Category pagination uses `page-N.html` inside the category | Follow the `next` link, do not guess the URL |
| Currency charset mangling | UTF-8 decode + regex number extraction |
| Missing description | Nullable field, tested |
| Partial crawl corrupting data | Build in memory, verify count, atomic `RENAME`, keep old on failure |
| Two crawls at once | `SET NX EX` lock with token-checked release |
| Cold start / empty Redis | Boot build + `503 CATALOGUE_NOT_READY` with `Retry-After`; `/health` shows status |
| Redis down | Serve stale snapshot (`X-Cache: STALE`) or `503`; detail falls back to a direct scrape without caching |
| Open-proxy / SSRF via `:id` | Strict id regex + only catalogue ids trigger upstream fetches |
| Thundering herd on one detail | In-process single-flight |
| Throttler tripping `api:check` | Default 100/min is above the script's volume; `/health` excluded |
| Flaky cache test | Assert `X-Cache` header, not timing |
| Tests hitting the live site | Fixture-backed transport everywhere except the manual `npm run sync` / `api:check` runs |

---

## 11. Final Acceptance Checklist

- [x] From a clean clone: `npm run redis:up` → `npm install` → `npm run dev` (or `npm run sync` then `npm run dev`) works per the README
- [x] Lint, typecheck, unit and e2e suites pass
- [x] Coverage ≥ 80% (parsers, query functions, services ≥ 90%)
- [x] After sync: 1,000 books; category counts sum to 1,000; every id matches the id regex
- [x] `GET /books?page=1` matches the site's page 1
- [x] `npm run api:check` passes fully against a running instance
- [x] Consistent error shape for 400/404/429/502/503/504; no HTML or stack traces leak
- [x] Redis-down and upstream-down scenarios behave as specified
- [x] Swagger complete at `/docs`
- [x] `LIMITATIONS.md` and `SITE_ANALYSIS.md` written (including `robots.txt` finding)
- [x] No secrets committed; `.env.example` present
- [x] Clean conventional-commit history

---

## 12. Progress

- [x] Phase 0 — Owner setup (scaffold created, Vitest & oxlint working, Node & git ready)
- [x] Phase 1 — Site analysis & fixtures
- [x] Phase 2 — Tooling & quality gates
- [x] Phase 3 — Config, errors, app bootstrap
- [x] Phase 4 — Domain types & parsers
- [x] Phase 5 — Outbound HTTP layer
- [x] Phase 6 — Redis store layer
- [x] Phase 7 — Query engine & catalogue service
- [x] Phase 8 — Sync
- [x] Phase 9 — E2E harness, health, categories
- [x] Phase 10 — Books list & search
- [x] Phase 11 — Book detail
- [x] Phase 12 — Hardening
- [x] Phase 13 — Assignment test script
- [x] Phase 14 — Documentation & one-command run
- [x] Phase 15 — Final QA & submission
- [ ] Phase 16 — Stretch (optional)
