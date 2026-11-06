# Hire request (v45b local unpublished)

Built 2026-11-06 AWST on local branch `v45b`. **Not pushed. Not on GitHub Pages. SQL not applied.**

## Catalog

Embedded snapshot: `work/hire/catalog-2026-11-06.snapshot.json`  
Source: `envss-invoicing/hire-catalog/supplier-rates.json` (`catalog_version` **2026-11-06-airmet-pricelist**).

| Supplier | Selectable in v1 | Items |
|---|---|---|
| Air-Met Scientific | yes | 152 (123 official pricelist + 29 supplementary/provisional invoice-only names) |
| NVMS | yes | 7 (official 4448 – Dosi / 2250 – SLM + booking/invoice aliases + $0 accessories) |
| Environmental Test Solutions (ETS) | yes | 3 (Little Pip, QED MP50 kit, YSI ProQuatro; provisional from invoices) |
| Mérieux NutriSciences | yes | 2 (AIR SAMPLER MERCK / ALS102, MicroBIO Air Impacter alias; provisional from invoices) |

Drop-down labels are exact `item_name` strings. Free-text fallback remains and is flagged. Rates (AUD ex GST) are stored as reference on each line — **no billing maths in v1**.

Official NVMS reference: 4448 Dosi day 50 / week 300 / month 1050; 2250 SLM day 215 / week 1290 / month 4515.

## Try locally

1. Open `field.html` from this checkout.
2. Sign in with `@envss.com.au` Google (same as today).
3. Dashboard → **Hire requests** → **New hire request**.
4. Reopen a request and **Save as new version**.

Helpers: `window.envssHire.openList()`, `.openNew()`, `.openEdit(id)`, `.catalog`, `.list()`.

## Sync / SQL

- Collection `hires` → `envss_hires` (`work/hire_v45b_01_envss_hires.sql` — draft only).
- Until SQL is applied, local saves work; remote upserts stay pending; hire pull failure is non-fatal.

## Do not

Push / Pages / apply SQL / write Podio / email Air-Met or NVMS / Google Sheet dual-entry.

ALS102 (AIR SAMPLER MERCK) reference day rate is $266.83 ex GST (primary invoiced). $274.57 is stored only as a variant seen on invoice 24371 dated 01/07/2025.

Delivery address (stored as `delivery_site`): labelled **Delivery address**; internal only (never on hire-company emails or Xero POs). Default for new requests: 10 Bermondsey Street, West Leederville WA 6007. Held unpublished so live v45b is unchanged until a later form update.
