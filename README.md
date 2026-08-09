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

| Date | ID  | Concept | Counterparty | Domain | Origin account | Destination account | Amount | Notes | Date created |
| ---- | --- | ------- | ------------ | ------ | -------------- | ------------------- | ------ | ----- | ------------ |

**`Config`** — accounts and domains:

| Accounts | Domains   |
| -------- | --------- |
| Checking | Groceries |
| Savings  | Rent      |
| …        | …         |

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

The repo ships with a workflow at
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) that builds
the site and publishes it to GitHub Pages on every push to `main`/`master`.

### 3.1 One-time repository setup

1. Push the repo to GitHub (repo name `catflow-web` — if you use a different
   name, change `base` and `navigateFallback` in `vite.config.js` first):

   ```sh
   git push -u origin master
   ```

2. On github.com, open the repo → **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**
   (not "Deploy from a branch"). This is the step people miss — without it
   the deploy job fails with a "Pages site not found" / HTTP 404 error.
4. If the first workflow run already failed because of that, just re-run it:
   **Actions → Deploy to GitHub Pages → failed run → Re-run all jobs**, or
   trigger it manually via **Actions → Deploy to GitHub Pages → Run
   workflow** (the workflow has `workflow_dispatch` enabled).

### 3.2 What the workflow does

- **build job**: checks out the repo, installs Node 22 with npm caching,
  runs `npm ci` (exact versions from `package-lock.json`, so the lockfile
  must be committed), runs `npm run build`, and uploads `dist/` as a Pages
  artifact.
- **deploy job**: publishes that artifact to the `github-pages` environment.
  No token setup needed — it uses the workflow's built-in OIDC permissions
  (`pages: write`, `id-token: write`), already declared in the file.

### 3.3 Verifying a deployment

1. **Actions** tab → the latest "Deploy to GitHub Pages" run should show
   both `build` and `deploy` green.
2. The `deploy` job's summary shows the published URL:
   `https://<your-username>.github.io/catflow-web/`.
3. Open it — you should see the CatFlow setup screen.

Every later `git push` redeploys automatically; the PWA picks up new
versions on next launch (`registerType: 'autoUpdate'`).

### 3.4 Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `deploy` fails with 404 / "Not Found" | Settings → Pages → Source must be **GitHub Actions**. |
| `npm ci` fails | `package-lock.json` missing or out of sync — run `npm install` locally and commit it. |
| Site loads but assets 404 | Repo name doesn't match `base: '/catflow-web/'` in `vite.config.js`. |
| Workflow never runs | You pushed to a branch other than `main`/`master`, or Actions are disabled (Settings → Actions → General). |
| Old version keeps showing on phone | Close and reopen the installed app; the service worker updates in the background on first load. |

## 4. First run on your phone

1. Open `https://<you>.github.io/catflow-web/`.
2. Enter the Apps Script `/exec` URL and your secret token.
3. Add to home screen (browser menu → _Install app_ / _Add to Home Screen_).

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
