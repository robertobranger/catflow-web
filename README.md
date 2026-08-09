# CatFlow

A tiny installable PWA for logging transactions to a Google Sheet from your
phone. Svelte + Vite frontend, Google Apps Script backend.

Features:

- Accounts and domains are read from the sheet (dropdowns)
- Autocomplete for concepts and counterparties from previous entries
- Offline queue: entries are stored locally and synced when back online
- Installable on the home screen (PWA)

## 1. Set up the Google Sheet

Create (or adjust) a spreadsheet with two tabs:

**`Transactions`** — header row, columns in this exact order:

| Date | ID | Concept | Counterparty | Domain | Origin account | Destination account | Amount | Notes | Date created |
| ---- | -- | ------- | ------------ | ------ | -------------- | ------------------- | ------ | ----- | ------------ |

**`Config`** — accounts and domains:

| Accounts | Domains |
| -------- | ------- |
| Checking | Groceries |
| Savings  | Rent |
| …        | … |

## 2. Deploy the Apps Script backend

1. In the sheet: **Extensions → Apps Script**, delete the default code and
   paste in [`apps-script/Code.gs`](apps-script/Code.gs).
2. **Project Settings → Script Properties → Add script property**:
   - Property: `TOKEN`
   - Value: a long random secret (e.g. run `openssl rand -hex 24`)
3. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy the web app URL (ends in `/exec`).

> The "Anyone" access is required for the browser to call the script.
> Requests without your secret token are rejected, and the URL itself
> contains a long unguessable id.

If you later edit `Code.gs`, use **Deploy → Manage deployments → Edit →
New version** so the `/exec` URL picks up the change.

## 3. Deploy the app to GitHub Pages

1. Push this repo to GitHub as `catflow-web`. (If you use a different repo
   name, change `base` and `navigateFallback` in `vite.config.js`.)
2. In the repo: **Settings → Pages → Source: GitHub Actions**.
3. Push to `main` — the included workflow builds and deploys automatically.

## 4. First run on your phone

1. Open `https://<you>.github.io/catflow-web/`.
2. Enter the Apps Script `/exec` URL and your secret token.
3. Add to home screen (browser menu → *Install app* / *Add to Home Screen*).

Both values are stored only in your browser's localStorage, never in the
repo. The ⚙ button lets you re-enter them.

## Development

```sh
npm install
npm run dev      # local dev server
npm run build    # production build to dist/
npm run preview  # serve the production build (PWA testing)
```

## How offline sync works

Every submission is written to an IndexedDB queue first, then the app
immediately tries to flush the queue to the sheet. If you're offline, the
entry stays queued (a "pending" badge appears) and is retried when the app
regains connectivity or is reopened. Each transaction carries a UUID and the
backend skips duplicates, so retries are safe.
