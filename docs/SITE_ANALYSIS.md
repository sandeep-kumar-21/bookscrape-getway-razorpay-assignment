# Site Analysis — books.toscrape.com

Comprehensive technical analysis of [https://books.toscrape.com](https://books.toscrape.com), conducted during Phase 1 before writing any application code.

---

## 1. robots.txt & Access Policies

- **Request**: `GET https://books.toscrape.com/robots.txt`
- **Result**: `404 Not Found` (nginx 1.21.6)
- **Policy**: The site is an open sandbox explicitly created by Scrapinghub / Zyte for web scraping practice (*"We love being scraped!"*).
- **Politeness Rules Adopted**:
  - Concurrency capped at 2 outbound requests.
  - Inter-request pacing delay of 300ms–1000ms.
  - Descriptive `User-Agent`: `bookscrape-gateway/1.0 (+https://github.com/assignment/bookscrape-gateway)`.
  - Catalogue crawl occurs only at boot (if not already cached) or via manual `npm run sync`, never per client request.

---

## 2. URL Structures & Traps

| Page Type | Canonical URL Pattern | Relative Href Pattern | Notes |
|---|---|---|---|
| **Homepage** | `https://books.toscrape.com/index.html` | Book links: `catalogue/{slug}_{id}/index.html` | Sidebar categories: `catalogue/category/books/...` |
| **Catalog Page** | `https://books.toscrape.com/catalogue/page-{N}.html` | Book links: `{slug}_{id}/index.html` (relative!) | Trap: Omits `catalogue/` prefix. **Always resolve with `new URL(href, currentPageUrl)`** |
| **Category Page** | `https://books.toscrape.com/catalogue/category/books/{slug}_{id}/index.html` | Book links: `../../../{slug}_{id}/index.html` | Next link: `page-2.html` (nested in category dir) |
| **Book Detail** | `https://books.toscrape.com/catalogue/{slug}_{id}/index.html` | Category breadcrumb: `../category/books/{slug}_{id}/index.html` | Image: `../../media/cache/...` |

---

## 3. Selector Specifications

### 3.1 Listing & Catalog Pages (`/catalogue/page-N.html`)

- **Total Results Count**:
  - Element: `.page-header ~ form strong:first-child` or `form.form-horizontal strong:first-child`
  - Text pattern: `<strong>1000</strong> results - showing <strong>1</strong> to <strong>20</strong>.`
  - Regex: `/(\d+)\s+results/` -> `1000`
- **Book Container**:
  - Selector: `article.product_pod`
- **Book ID & Slug**:
  - Selector: `h3 a[href]`
  - Extraction: Extract `{slug}_{id}` portion matching `^[a-z0-9-]+_\d+$`
- **Title**:
  - Selector: `h3 a[title]`
  - Note: Visual text inside `<a>` is truncated with `...` (e.g. `A Light in the ...`). The complete untruncated title is always located in the `title` attribute.
- **Price & Currency**:
  - Selector: `p.price_color`
  - Extraction: Regex `/([0-9]+\.[0-9]{2})/` -> `51.77` as `number`. Currency is `"INR"`.
  - Note: Always decode response as UTF-8. Avoid relying on the `£` symbol directly.
- **Star Rating**:
  - Selector: `p.star-rating`
  - Classes: `One`, `Two`, `Three`, `Four`, `Five`
  - Mapping: `One` -> 1, `Two` -> 2, `Three` -> 3, `Four` -> 4, `Five` -> 5.
- **Stock Availability**:
  - Selector: `p.instock.availability`
  - Listing value: Only `"In stock"` text exists; no quantity is provided on listing pages.
- **Image URL**:
  - Selector: `.image_container img[src]`
  - Resolution: `new URL(src, pageUrl).href`
- **Pagination Next Link**:
  - Selector: `ul.pager li.next a[href]`
  - On page 50: `li.next` is absent.

### 3.2 Book Detail Pages (`/catalogue/{slug}_{id}/index.html`)

- **Title**: `div.product_main h1`
- **Category**:
  - Selector: `ul.breadcrumb li:nth-last-child(2) a`
- **Stock Availability & Count**:
  - Selector: `div.product_main p.instock.availability` or `table tr:contains('Availability') td`
  - Value: `In stock (22 available)`
  - Extraction: Regex `\((\d+)\s+available\)` -> `22` as `number`.
- **Description**:
  - Selector: `#product_description + p` (or `$('#product_description').next('p')`)
  - **Important finding**: Description is **nullable**! In some books (e.g., `the-bridge-to-consciousness..._840`), the `#product_description` element and paragraph are completely absent.
- **Product Information Table**:
  - Selector: `table.table-striped tr`
  - Key-value mapping:
    - `UPC`: `td` text (e.g. `a897fe39b1053632`)
    - `Product Type`: `td` text (e.g. `Books`)
    - `Price (excl. tax)`: regex `/([0-9]+\.[0-9]{2})/`
    - `Price (incl. tax)`: regex `/([0-9]+\.[0-9]{2})/`
    - `Tax`: regex `/([0-9]+\.[0-9]{2})/`
    - `Availability`: `td` text
    - `Number of reviews`: integer parsed from `td` text (typically `0`)
- **Cover Image**:
  - Selector: `#product_gallery .item.active img[src]`

---

## 4. Categories & Hierarchy Analysis

- **Sidebar Container**: `<div class="side_categories"> <ul class="nav nav-list">`
- **Top-Level "Books" Warning**:
  - The first link is `Books` (`books_1`). It contains all 1,000 books across all categories.
  - **Rule**: Must be excluded from category list; only sub-items (`nav-list > li > ul > li > a`) represent real categories.
- **Total Genuine Categories**: Exactly **50** categories (IDs `travel_2` to `crime_51`).
- **Book Count Verification**:
  - Sum of book counts across all 50 categories equals exactly **1,000**.
- **Pagination in Categories**:
  - 12 categories are **multi-page** (> 20 books):
    1. Mystery (`mystery_3`): 32 books (2 pages)
    2. Historical Fiction (`historical-fiction_4`): 26 books (2 pages)
    3. Sequential Art (`sequential-art_5`): 75 books (4 pages)
    4. Romance (`romance_8`): 35 books (2 pages)
    5. Fiction (`fiction_10`): 65 books (4 pages)
    6. Childrens (`childrens_11`): 29 books (2 pages)
    7. Nonfiction (`nonfiction_13`): 110 books (6 pages)
    8. Default (`default_15`): 152 books (8 pages)
    9. Add a comment (`add-a-comment_18`): 67 books (4 pages)
    10. Fantasy (`fantasy_19`): 48 books (3 pages)
    11. Young Adult (`young-adult_21`): 54 books (3 pages)
    12. Food and Drink (`food-and-drink_33`): 30 books (2 pages)
  - 28 categories have 1–20 books (single page).
  - 10 categories have 0 books (e.g. `paranormal_24`, `parenting_28`, `adult-fiction_29`, `academic_40`, `suspense_44`, `short-stories_45`, `novels_46`, `cultural_49`, `erotica_50`, `crime_51`).

---

## 5. Saved Fixtures Inventory (`test/fixtures/`)

| File Name | Source URL | Purpose |
|---|---|---|
| `homepage.html` | `/index.html` | Tests root listing, relative hrefs (`catalogue/...`), total results count (1000), sidebar categories |
| `page-2.html` | `/catalogue/page-2.html` | Tests catalog pagination, relative hrefs without `catalogue/`, prev/next links |
| `page-50.html` | `/catalogue/page-50.html` | Tests last catalog page (boundary: `next` link is null) |
| `category-mystery-page-1.html` | `/catalogue/category/books/mystery_3/index.html` | Tests category page 1 parsing and `page-2.html` detection |
| `category-mystery-page-2.html` | `/catalogue/category/books/mystery_3/page-2.html` | Tests category page 2 parsing and termination (`next` link null) |
| `detail-a-light-in-the-attic.html` | `/catalogue/a-light-in-the-attic_1000/index.html` | Tests 3-star book detail with description, stock count 22, full table |
| `detail-tipping-the-velvet.html` | `/catalogue/tipping-the-velvet_999/index.html` | Tests 1-star book detail, stock count 20 |
| `detail-sapiens.html` | `/catalogue/sapiens-a-brief-history-of-humankind_996/index.html` | Tests 5-star book detail |
| `detail-no-description.html` | `/catalogue/the-bridge-to-consciousness..._840/index.html` | Real live book with **no description paragraph** (`description: null`) |
| `404.html` | `/non-existent-page.html` | Tests upstream 404 handling |
| `broken.html` | Synthesized malformed HTML | Tests parser resilience and explicit `ParseError` throwing |
