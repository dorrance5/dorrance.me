# dorrance.me

This is a static site of small phone apps. GitHub Pages deploys `main` with `.github/workflows/static.yml`. The owner is the only user.

## Push rule

- Push every finished change to `main`. Do not ask first. The owner gave this permission for all sessions.
- Run the checks for the app before you push. Push only when they pass.
- If the session has its own branch, push that branch too.
- Do not rewrite the history of `main`. Fast-forward it or add commits.
- After the push, check that the "Deploy static content to Pages" run starts.

## Costs

- The site must cost nothing to run. The only bill is the yearly renewal of the domain `dorrance.me` at Cloudflare Registrar.
- Use only free services on free plans. Do not start a trial, a paid plan or a paid API, and do not add a payment method.
- Ask the owner before you add a service, an API key or a Cloudflare binding. Today the site uses only GitHub Pages, GitHub Actions, the GitHub API (from the Worker), Cloudflare DNS, one Cloudflare Worker with one KV namespace and the owner's Google Apps Script (Parking).
- GitHub: keep the repository public. Pages and Actions are free for public repositories. In workflows, use only standard runners such as `ubuntu-latest`. Larger runners cost money even for public repositories. Do not use Git LFS.
- Keep the published site under 1 GB. Put photos in as small JPEGs.
- Cloudflare: the account stays on the Workers Free plan. On that plan, a request over a limit fails with an error. It is never billed. Do not move to Workers Paid.
- The Worker must fit the free limits: 100,000 requests a day and 10 ms of CPU for each request. For KV: 100,000 reads, 1,000 writes, 1,000 deletes and 1,000 lists a day, and 1 GB stored. Do not put a KV write, delete or list on a request that runs often, such as loading a page.
- If a change does not fit a free limit, change the design so it fits. Do not upgrade a plan.

## Layout

- Each app is a folder with its own `index.html`, `manifest.json` and `sw.js`.
- Converter, Counter, Parking, Triangle and TV Mount use `shared/base.css` and `shared/base.js`. A change in `shared/` affects all five apps.
- Calculator has its own styles and scripts.
- `shared/account.js` is the dorrance.me sign-in. Only pages that load it use it (Recipes). It does not affect the five apps above.
- All apps share one theme setting, the `theme` key in localStorage.

## Design

- TV Mount is the model for how every app looks. `docs/design-handoff.md` tells how to restyle the other apps.

## Choices

- In every row of choice buttons, put the default option on the left.

## Offline cache

- When you change a file that an app uses, increase `CACHE` in the `sw.js` of that app. Example: `tvmount-v6` becomes `tvmount-v7`.

## TV Mount checks

- Run the unit tests: `node --test tvmount/test/*.test.js`
- Run the browser checks: `NODE_PATH=<folder with playwright> node tvmount/test/flows.cjs`
- Make the screenshots: `NODE_PATH=<folder with playwright> node tvmount/test/shots.cjs <output folder>`
- Look at the screenshots before you push.
- The browser scripts ask for WebKit. If only Chromium is installed, make a `playwright` module that exports `chromium` as `webkit`, and put it on `NODE_PATH`.

## Recipes

- `recipes/` is a standalone page, not one of the apps. It has no `manifest.json` and no `sw.js`, so there is no `CACHE` to increase. Do not add it to the home page.
- `recipes/recipes.json` is the only copy of the recipes. The page saves to it through the API Worker (`worker/recipes.js`), which holds the GitHub token. `docs/recipes-handoff.md` has the data format.
- Run the unit tests: `node --test recipes/test/*.test.js`
- Run the browser checks: `NODE_PATH=<folder with playwright> node recipes/test/flows.cjs`
- Make the screenshots: `NODE_PATH=<folder with playwright> node recipes/test/shots.cjs <output folder>`
- Render the icons: `NODE_PATH=<folder with playwright> node docs/icons/render-recipes.cjs`
- Each recipe in `recipes/recipes.json` has an `owner`: the name of the account it belongs to. When you add a recipe from chat, set `owner` to the person it is for, and leave out `shared` unless they do not want it shared (`"shared": false`). `docs/recipes-handoff.md` has the format.
- The browser checks and most unit tests use `recipes/test/fixture-recipes.json`, a frozen copy of the book, so edits to `recipes/recipes.json` do not break them.

## Accounts and the API Worker

- `worker/` is the API Worker on `dorrance.me/api/*`: the TV Mount library, the dorrance.me accounts (`worker/auth.js`) and the Recipes saves. `docs/accounts.md` tells how the accounts work and how to use them in an app.
- Run the Worker checks: `node --test worker/test/*.test.js`
- A push does not deploy the Worker. After a change in `worker/`, run the Worker checks and the checks of the apps that use the changed routes, then run `npx wrangler deploy` in `worker/`. Then check that `https://dorrance.me/api/tvmount/lib` still answers.
- `recipes/meals.js` is part of the Worker too: `worker/meals.js` imports it for the Recipes meal plan. A change to it needs the same Worker checks and deploy.

## Commits

- Start the commit title with the app name, for example `TV Mount: measure to the soundbar bottom`.
