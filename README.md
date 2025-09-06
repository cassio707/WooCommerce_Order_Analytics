# WooCommerce Sales Dashboard (Jalali + Charts)

A lightweight, client-side dashboard for WooCommerce that pulls orders via the REST API and shows:
- Daily sales (Jalali calendar) + **line** for order counts
- Hourly sales (0–23)
- Item-level sales (all line items)
- Discounts summary (daily + totals)
- **Top hour** and **top day** highlights
- JSON/Excel export

All numbers render with Persian numerals; currency is auto-detected (IRR/IRT/other). Display is Jalali; API queries use Gregorian/ISO8601.

---

## Features

- **Quick filters:** Today, This Week (Sat–Fri), last 1/3/6/12/24 months, or custom Jalali/Gregorian range
- **Order status** filter (completed, processing, etc.)
- **Charts:** Daily (bar for amount + line for count), Hourly (bar)
- **Tables:** Daily, Hourly, Items, Discounts (daily)
- **Highlights:** Best hour & best day (by total amount)
- **Exports:** JSON and Excel (`.xlsx`)
- **RTL + local font:** Uses local `Pinar.woff2`

---

## Requirements

- A WooCommerce site with REST API enabled
- WooCommerce **Consumer Key** and **Consumer Secret** (Read permission is enough)
- Modern browser (no build tools required)

> ⚠️ **Security:** This is a client-side app. Anyone with access to the page and your keys could use them. Prefer:
> - Running locally (open `index.html` from your machine) **or**
> - Hosting this dashboard on the same domain as your store (so no CORS issues) **and**
> - Using keys with **read-only** permissions and rotating them regularly.

---

## Quick Start

1. Put these files in one folder:
   ```
   index.html
   app.js
   Pinar.woff2
   README.md
   ```
2. Open `index.html` in your browser.
3. Enter:
   - **Site URL** (e.g., `https://example.com`)
   - **Consumer Key** and **Consumer Secret**
   - (Optional) Order status and date range
4. Click **“دریافت آمار”** (Fetch).
5. Use **Export JSON** / **Export Excel** as needed.

---

## WooCommerce API Setup

- In your WordPress admin: **WooCommerce → Settings → Advanced → REST API → Add key**  
  - Permissions: **Read**
- The app calls:
  ```
  GET /wp-json/wc/v3/orders
  ?consumer_key=...&consumer_secret=...
  &per_page=100&page=1
  &orderby=date&order=desc
  &status=...&after=...&before=...
  ```
- Pagination is handled automatically using `X-WP-TotalPages`.

### CORS Notes
- If you open the dashboard **from a different origin** than your store, the browser may block requests due to CORS.
- Solutions:
  - Host `index.html` on the **same domain** as your WooCommerce site, or
  - Configure your server to allow CORS for this dashboard’s origin, or
  - Use a reverse proxy under the same domain.

---

## Usage Details

### Date Ranges
- **Today:** from local midnight to now (browser timezone).
- **This week:** Saturday → Friday (based on browser local time).
- **Custom:** You can enter **Jalali** dates (e.g., `1403/06/01`). They are converted to Gregorian (UTC ISO) for the API.
- Displayed dates are **Jalali**. Requests use **UTC ISO 8601** `after`/`before`.

### Currency & Numbers
- Currency is detected from orders (`IRR`, `IRT`, or others).
- Formatting:
  - `IRR`/`IRT`: no decimals, with Persian numerals and unit label (`ریال`/`تومان`)
  - Other currencies: 2 decimals + currency code
- All numerals are rendered with `fa-IR` locale.

### Calculations
- **Totals:** `order.total` is aggregated for sales amount.
- **Items:** Each line item uses `line_items.total` (after item-level discount).
- **Discounts:** For each order, discount amount =  
  `max(order.discount_total, sum(line_item.subtotal - line_item.total))`  
  (prevents under/over counting between item-level discounts and order-level coupons).
- **Best hour/day:** Determined by highest **amount** (not count).

---

## Export

- **JSON:** Full stats object (`stats`) + metadata (`generated_at`, `currency`).
- **Excel:** Sheets:
  - `Overview`
  - `Daily (Jalali)`
  - `Hourly`
  - `Items`
  - `Discounts (Daily)`

---

## Customization

- **Font:** Place `Pinar.woff2` next to `index.html` and `app.js`. Update `@font-face` if you use another font.
- **Charts:** Colors are defined inline in `app.js` (`updateDailyChart`, `updateHourlyChart`). You can adjust datasets or add moving averages.
- **Tables/Panels:** Toggle panels via the three checkboxes (Hourly, Items, Discounts).

---

## Folder Structure

```
/your-folder
  ├─ index.html      # UI and CDN scripts
  ├─ app.js          # Logic: fetch, aggregate, render, charts, export
  ├─ Pinar.woff2     # Local Persian font
  └─ README.md
```

---

## Troubleshooting

- **401/403 Unauthorized:** Check keys, permissions, or if REST API is enabled.
- **CORS error in console:** Host on same domain or enable CORS from your store server.
- **Empty data:** Verify date range, order status filter, and that there are orders.
- **Time mismatch:** “Today/This week” are based on the browser timezone; API filters use UTC ISO.

---

## License

This dashboard is provided “as is.” Use and modify as you like for your project needs.
