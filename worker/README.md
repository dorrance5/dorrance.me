# dorrance.me API worker

This Cloudflare Worker stores the shared TV Mount library of saved TVs and mounts. It also keeps the dorrance.me
accounts (`auth.js`, see `docs/accounts.md`), saves Recipes to GitHub (`recipes.js`, see `docs/recipes-handoff.md`),
and keeps the Recipes meal plan and grocery list (`meals.js`).

`meals.js` imports `../recipes/meals.js`, which the Recipes page uses too, and `npx wrangler deploy` bundles it into the
Worker. So a change to `recipes/meals.js` also needs a Worker deploy.

## Set up

1. Open the Cloudflare dashboard.
2. Go to Storage & Databases > KV.
3. Create a namespace with the name `tvmount-lib`.
4. Copy the ID of the namespace into `id` in `wrangler.toml`.
5. In this folder, run `npx wrangler login`.
6. Run `npx wrangler secret put PASSCODE`. Type the passcode for saves and deletes.
7. Run `npx wrangler deploy`.
8. Open `https://dorrance.me/api/tvmount/lib`. You see `{"tvs":[],"mounts":[]}`.

The route `dorrance.me/api/*` sends only these requests to the worker. GitHub Pages serves all other pages.

## Accounts and Recipes setup

The routes are `dorrance.me/api/auth/*` for the accounts and `dorrance.me/api/recipes/*` for Recipes. The accounts are
in the same KV namespace, under keys that start with `auth:`. The admin's name is the var `ADMIN` in `wrangler.toml`.

1. Make a GitHub token for Recipes at https://github.com/settings/personal-access-tokens/new: "Only select repositories"
   > `dorrance5/dorrance.me`, and "Contents" set to "Read and write".
2. Add two secrets. In the Cloudflare dashboard: Workers & Pages > `dorrance-api` > Settings > Variables and Secrets.
   Or in this folder:
   - `npx wrangler secret put ADMIN_PASSWORD`, then type the admin password.
   - `npx wrangler secret put GITHUB_TOKEN`, then paste the token.
3. Open `https://dorrance.me/api/auth/me`. You see `{"error":"signin"}`.

## Meal plan

The routes are `dorrance.me/api/meals` and `/api/meals/*`. They need no setup: they use the same KV namespace, under
`meals:plan:ID` (each plan) and `meals:me:KEY` (who shares and who asked). Everyone signed in has a plan, and two
people can share one. Plans are private, so they stay in KV and never go to the public GitHub repository. A GET only
reads; a POST of a batch of changes is one read and one write; asking, saying yes and stopping are a few writes. The
comment at the top of `meals.js` lists the routes and the error codes.

Run the checks with `node --test worker/test/*.test.js`. A change to this folder goes live only with
`npx wrangler deploy`. A push to `main` does not deploy the Worker.
