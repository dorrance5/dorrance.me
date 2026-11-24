# dorrance.me

This is a static site of small phone apps. Cloudflare Pages (project `dorrance5`) deploys every push to `main` and serves dorrance.me. The GitHub Pages workflow `.github/workflows/static.yml` runs only by hand. The owner is the only user.

## Push rule

- Push every finished change to `main`. Do not ask first. The owner gave this permission for all sessions.
- Run the checks for the app before you push. Push only when they pass.
- If the session has its own branch, push that branch too.
- Do not rewrite the history of `main`. Fast-forward it or add commits.
- After the push, check that the "Cloudflare Pages" check on the commit succeeds: `curl https://api.github.com/repos/dorrance5/dorrance.me/commits/<sha>/check-runs`. Preview copies are at `<hash>.dorrance5.pages.dev`.

## Costs

- The site must cost nothing to run. The only bill is the yearly renewal of the domain `dorrance.me` at Cloudflare Registrar.
- Use only free services on free plans. Do not start a trial, a paid plan or a paid API, and do not add a payment method.
- Ask the owner before you add a service, an API key or a Cloudflare binding. Today the site uses only Cloudflare Pages, GitHub Pages (by hand only), GitHub Actions, the GitHub API (from the Worker), Cloudflare DNS, one Cloudflare Worker with one KV namespace and the owner's Google Apps Script (Parking).
- GitHub: keep the repository public. Pages and Actions are free for public repositories. In workflows, use only standard runners such as `ubuntu-latest`. Larger runners cost money even for public repositories. Do not use Git LFS.
- Cloudflare Pages free plan: 500 builds a month (each push and each Recipes save is one), 20,000 files and 25 MiB a file.
- Keep the published site under 1 GB. Put photos in as small JPEGs.
- Cloudflare: the account stays on the Workers Free plan. On that plan, a request over a limit fails with an error. It is never billed. Do not move to Workers Paid.
- The Worker must fit the free limits: 100,000 requests a day and 10 ms of CPU for each request. For KV: 100,000 reads, 1,000 writes, 1,000 deletes and 1,000 lists a day, and 1 GB stored. Do not put a KV write, delete or list on a request that runs often, such as loading a page.
- If a change does not fit a free limit, change the design so it fits. Do not upgrade a plan.

## Layout

- Each app is a folder with its own `index.html`, `manifest.json` and `sw.js`.
- Converter, Counter, Parking, Triangle, TV Mount and Road Trip use `shared/base.css` and `shared/base.js`. A change in `shared/` affects all six apps.
- Calculator has its own styles and scripts.
- `shared/account.js` is the dorrance.me sign-in. Only pages that load it use it (Recipes and Road Trip). It does not affect the other apps above.
- All apps share one theme setting, the `theme` key in localStorage.

## Design

- TV Mount is the model for how every app looks. `docs/design-handoff.md` tells how to restyle the other apps.
- Wide screens, like the open iPhone Duo (upright or sideways; closed it is narrower): at `min-width:560px` an app may use two panes. Converter and Counter do (Converter sideways from 800 px swaps them: every unit on the left, the amount, the answer and its keypad on the right; while the keypad is open its category bar moves its buttons left of it); Triangle does only in landscape (open upright keeps the phone layout, on purpose). TV Mount does from 640 px (sketch and results left, form right, each scrolling by itself, the keypad over the form only). Recipes: from 640 px ingredients and steps both show side by side with no tab bar (the open Duo, upright and sideways); sideways from 800 px (or any width from 900 px) the box stays on the left, 384 px wide with the tab bar under it, and the recipe sits beside it, showing the last opened recipe or "Pick a recipe" (`html.side`). Road Trip sideways from 800 px moves its tab bar to a rail on the right and puts Stats, Expenses and More in two columns. Calculator fills the width at every size and shows history on the left only when the open Duo is sideways (`orientation:landscape` and `min-width:800px`). Below that, keep the phone layout as it is. Two apps side by side on the open Duo get about 385 px each, so they show the phone layout. The Duo's four tested screen sizes (closed, open, open sideways, split) are defined once in `test/devices.cjs`, the only place to change them (measured in iOS Safari: closed 382, open 669, open sideways 951, split 385; the keyboard-up heights are there too). Closed sideways (594) isn't tested because the owner doesn't use it. Calculator, Converter, Counter, Recipes, Triangle and TV Mount check closed, open and open sideways; Road Trip checks all four.

- Every app on `shared/base.css` has its name at the top left and its menu button at the top right. Counter's +, Edit and sort are in a bottom bar built like Converter's category bar (`#bar`); like every bottom bar it hides while the phone keyboard is up (`html.kb`), as in Road Trip.
- A scrolled `main` (and each of TV Mount's two `.col` panes) fades out over 16 px under the header: `shared/base.js` sets `.scrolled`, `shared/base.css` masks it. A page with a sticky pane on the left sets `--nofade` to its width (Triangle sideways) so that pane stays crisp.
- The shared keypad (`shared/keypad.js`, `shared/keypad.css`) is used by TV Mount, Converter and Triangle. Its feet key reads `ft`.

- iPhone home screen apps on iOS 26 (WebKit bug 301108): a page shorter than the screen gets a viewport cut short by the status bar, and nothing shows under it. Each app keeps its page at least the screen's height in `@media (display-mode:standalone)` (`shared/base.css`, Calculator, Recipes, the home page); keep that rule when you change page heights. Since iOS 26.1 a page cannot clear the haze behind the status bar; start content below it.

## Choices

- Menu bars and tab bars go at the bottom or on the right side, never on the left or at the top. One exception: Calculator's menu button is at the top left, and its history slides in from the left, so the number on the right never runs under it.
- TV Mount only: in every row of choice buttons, put the default option on the left. This is not a site-wide rule.

## Offline cache

- When you change a file that an app uses, increase `CACHE` in the `sw.js` of that app. Example: `tvmount-v6` becomes `tvmount-v7`.
- The home page has its own `sw.js` at the top of the site. Increase its `CACHE` when you change `index.html`, an app icon on it, or `photos/cat-thumb.jpg`. It answers only for the files in its list; everything else goes to the network.
- Recipes has `recipes/sw.js`. Increase its `CACHE` when you change a file in `recipes/` other than `recipes.json`, or `shared/account.js`. It never caches `recipes.json` or `/api/`.
- After an update the page shows "Updated · Tap to reload". The new version is in the cache once that shows.

## TV Mount checks

- Run the unit tests: `node --test tvmount/test/*.test.js`
- Run the browser checks: `NODE_PATH=<folder with playwright> node tvmount/test/flows.cjs`
- Make the screenshots: `NODE_PATH=<folder with playwright> node tvmount/test/shots.cjs <output folder>`
- Look at the screenshots before you push.
- The browser scripts ask for WebKit. If only Chromium is installed, make a `playwright` module that exports `chromium` as `webkit`, and put it on `NODE_PATH`.

## Checks for the other apps and the home page

- Each has browser checks. Run the ones for what you changed: `NODE_PATH=<folder with playwright> node <app>/test/flows.cjs` for Calculator, Converter, Counter, Parking and Triangle, and `node test/flows.cjs` for the home page.
- A change in `shared/` affects Converter, Counter, Parking, Triangle, TV Mount and Road Trip. Run the checks of all six.
- Each one also checks the offline cache: the page opens with the network off, and an update shows "Updated · Tap to reload".

## Recipes

- `recipes/` is a standalone page, not one of the apps. It has no `manifest.json`. It has a `sw.js` so it opens offline (see Offline cache). The home page links it with the apps; its icon there is `docs/icons/recipes-home.svg`, rendered by `docs/icons/render.cjs`.
- `recipes/recipes.json` is the only copy of the recipes. The page saves to it through the API Worker (`worker/recipes.js`), which holds the GitHub token. `docs/recipes-handoff.md` has the data format.
- Run the unit tests: `node --test recipes/test/*.test.js`
- Run the browser checks: `NODE_PATH=<folder with playwright> node recipes/test/flows.cjs`
- Make the screenshots: `NODE_PATH=<folder with playwright> node recipes/test/shots.cjs <output folder>`
- Render the icons: `NODE_PATH=<folder with playwright> node docs/icons/render-recipes.cjs`
- Each recipe in `recipes/recipes.json` has an `owner`: the name of the account it belongs to. When you add a recipe from chat, set `owner` to the person it is for, and leave out `shared` unless they do not want it shared (`"shared": false`). `docs/recipes-handoff.md` has the format.
- `recipes/import.txt` tells AI assistants how to make an import file. Keep it in step with `parseImport` in `recipes/data.js`.
- The browser checks and most unit tests use `recipes/test/fixture-recipes.json`, a frozen copy of the book, so edits to `recipes/recipes.json` do not break them.

## Road Trip

- `roadtrip/` tracks household cars, fill-ups, expenses and reminders. Private data lives in the existing Worker KV, never in the public repository.
- `roadtrip/data.js` is shared with the Worker. Changes to it require a Worker deploy. `roadtrip/import.js` runs only in the browser.
- Import accepts Road Trip CSV files or their ZIP export. Reimport skips existing records, including archived ones. Keep real exports and screenshots of real data outside the repository; tests use fictional `roadtrip/test/fixture.json`.
- Unit tests: `node --test roadtrip/test/*.test.js`
- API tests: `node --test worker/test/*.test.js`
- Browser checks: `NODE_PATH=<folder with playwright> node roadtrip/test/flows.cjs` (includes the Duo sizes from `test/devices.cjs`, offline edits and updates).
- Screenshots: `NODE_PATH=<folder with playwright> node roadtrip/test/shots.cjs <output folder outside the repository>`. Look at them before pushing.
- Increase `roadtrip/sw.js` CACHE after changing Road Trip files or shared files it uses.

## Accounts and the API Worker

- `worker/` is the API Worker on `dorrance.me/api/*`: the TV Mount library, the dorrance.me accounts (`worker/auth.js`) and the Recipes saves. `docs/accounts.md` tells how the accounts work and how to use them in an app.
- Run the Worker checks: `node --test worker/test/*.test.js`
- A push does not deploy the Worker. After a change in `worker/`, run the Worker checks and the checks of the apps that use the changed routes, then run `npx wrangler deploy` in `worker/`. Then check that `https://dorrance.me/api/tvmount/lib` still answers.
- `recipes/meals.js` is part of the Worker too: `worker/meals.js` imports it for the Recipes meal plan. A change to it needs the same Worker checks and deploy.

## Commits

- Start the commit title with the app name, for example `TV Mount: measure to the soundbar bottom`.
