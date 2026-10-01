# Limitations & Long-Term Solutions

This document outlines the operational and architectural limitations of the **BookScrape Gateway**, explains the trade-offs made in reverse-engineering a public website without an official API, and specifies the recommended long-term production remedies.

---

## 1. Technical Limitations

### 1.1 Structural HTML Dependency
- **Issue**: The scraper relies on CSS selectors (`article.product_pod`, `div.product_main`, `table.table-striped`, etc.) and URL breadcrumb structures of `books.toscrape.com`. Any frontend layout redesign, class rename, or CMS upgrade on the source website will break HTML parsing.
- **Mitigation in this codebase**:
  - Parsers are completely isolated into pure, side-effect-free functions ([`listing.parser.ts`](file:///e:/Assignment_Projects/bookscrape-getway-razorpay-assignment/src/modules/books/parsers/listing.parser.ts), [`book-detail.parser.ts`](file:///e:/Assignment_Projects/bookscrape-getway-razorpay-assignment/src/modules/books/parsers/book-detail.parser.ts), etc.).
  - An extensive suite of offline HTML fixtures tests each parser against real DOM edge cases. If upstream changes selectors, updates can be developed, tested, and deployed without touching routing, validation, or business logic.

### 1.2 Lack of Upstream SLA & Rate Limits
- **Issue**: The gateway depends on a third-party server outside our control. If `books.toscrape.com` experiences downtime, latency spikes, or network partition, upstream requests will fail.
- **Mitigation in this codebase**:
  - Exponential backoff with jitter on network/5xx failures ([`ScraperClient`](file:///e:/Assignment_Projects/bookscrape-getway-razorpay-assignment/src/common/http/scraper-client.ts)).
  - Upstream errors translate to standard `502 Bad Gateway` and `504 Gateway Timeout` rather than 500 crashes.
  - Stale catalogue fallback: If Redis or the upstream server is down, the catalogue service continues serving the last known in-process snapshot marked with `X-Cache: STALE`.

### 1.3 Data Staleness & Eventual Consistency
- **Issue**: Product catalog data (prices, titles, availability) is scraped periodically during the sync crawl. Data does not update in real-time if books are added, modified, or removed on the source website between syncs.
- **Mitigation in this codebase**:
  - Book detail pages are lazily scraped on demand upon first request (`X-Cache: MISS`), cached with a 7-day TTL, and refreshed immediately upon a full catalogue re-sync.
  - The `/api/v1/health` endpoint exposes `sync.lastSync` and `catalogue.builtAt` timestamps so consumers can monitor data freshness.

### 1.4 Cache Durability vs. RDBMS
- **Issue**: Redis is used as a fast, volatile key-value cache and snapshot store. It is not an ACID relational database with transaction logs. If Redis restarts without persistence or undergoes a cache flush, the catalogue must be rebuilt, creating a brief window where requests receive `503 Service Unavailable` with `Retry-After: 10`.
- **Mitigation in this codebase**:
  - Cold starts trigger non-blocking background builds when `AUTO_SYNC_ON_BOOT=true`.
  - Atomic publication (`SET catalogue:tmp` followed by `RENAME catalogue:tmp catalogue`) prevents partial or corrupted catalogue states.

### 1.5 Search Scope
- **Issue**: The `/api/v1/books/search` endpoint performs multi-token AND matching and ranking exclusively across book **titles**. Book descriptions are not indexed in the catalogue because descriptions are only available on individual detail pages.
- **Mitigation in this codebase**:
  - Documented clearly in Swagger and the README.
  - Pre-normalizes search queries (case folding, diacritic removal, whitespace collapsing) and ranks exact matches above prefix matches and substring matches.

### 1.6 Politeness Constraints
- **Issue**: Out of respect for the upstream infrastructure, the crawler strictly enforces `HTTP_CONCURRENCY=2` and an inter-request pacing delay of `300ms` (`HTTP_DELAY_MS`). Full catalogue synchronization takes approximately 30–60 seconds across all 50 listing pages and 50 category trees.

---

## 2. Long-Term Solutions

The appropriate long-term resolution is to transition from web scraping to an **authorized data partnership or official API integration**:

1. **Official REST/GraphQL API or Sitemap / Feed**:
   - Request or negotiate an official data-sharing agreement with the data provider, such as an official JSON API, webhooks for product updates, or a daily XML/JSON sitemap feed export.
2. **Adapter-Based Migration**:
   - Because our architecture abstracts outbound data fetching behind the [`HttpTransport`](file:///e:/Assignment_Projects/bookscrape-getway-razorpay-assignment/src/common/http/http-transport.interface.ts) and [`KeyValueStore`](file:///e:/Assignment_Projects/bookscrape-getway-razorpay-assignment/src/common/store/key-value-store.interface.ts) interfaces, migrating to an official API requires only replacing the underlying scraper client with an official API adapter.
   - The public REST API contracts (`/api/v1/books`, `/api/v1/categories`, etc.), query engine, class-validator DTOs, and client integrations will remain 100% backward compatible without any breaking changes.
