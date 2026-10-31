# dorrance.me accounts

One name and password works on every page of dorrance.me. Recipes uses the accounts now. Another app can use them when it needs to know who someone is, for example to let only approved people save.

## How it works

- **The Worker** (`worker/auth.js`, in the API Worker on `dorrance.me/api/*`) keeps the accounts in KV and checks every sign-in. `worker/auth.js` lists its routes under `/api/auth/`.
- **The page side** is `shared/account.js` (`window.Account`). It keeps the sign-in in localStorage under `dorrance-session` as `{ token, name, admin }`. All pages on dorrance.me share localStorage, so a sign-in on one page works on all of them, as the `theme` key does. A page that does not load `shared/account.js` is not affected by it.
- **The admin** is the Worker var `ADMIN` ("Mitchell") with the Worker secret `ADMIN_PASSWORD`. The admin's account is not in KV, so no one can take that name.
- **Other people** ask for an account with a name and a password. The account waits until the admin approves it. Approved people and the admin can sign in. Reading pages needs no account.

## The rules

- A name has 2 to 24 letters, numbers, spaces and `. ' _ -`, and starts with a letter or a number. Names do not care about upper and lower case. A password has 8 characters or more.
- The Worker keeps passwords as PBKDF2 hashes with a salt, and sign-ins as SHA-256 hashes, so KV holds nothing that works as typed.
- A sign-in lasts a year. Sign out ends it on the phone and on the Worker. Removing an account ends its sign-ins, even if someone takes the name again. A new admin password ends the admin's sign-ins.
- Eight failed sign-ins or new accounts from one address lock that address for 15 minutes. At most 25 accounts can wait at once.
- An approved account can do everything that the apps allow signed-in people to do. If an app needs its own list of people later, add it to the account record in `worker/auth.js`.
- Do not put a password or a sign-in in the repo, in a URL, or in a log.

## Approving accounts

Today the admin approves accounts in Recipes: Settings > "Waiting for you" has Approve and Deny, and Settings > Accounts has Remove. A dot on Settings in the Recipes tab bar shows while someone is waiting. `GET /api/auth/me` counts the waiting accounts with a KV list, so a page should not call it on every load; Recipes asks at most once every 6 hours. Another app can show the same list with `Account.mine().users()`, `.approve(key)` and `.remove(key)`.

## Use the accounts in an app

1. Load the script before the app's own script:

   ```html
   <script src="../shared/account.js"></script>
   ```

   If the app has a service worker, add `'../shared/account.js'` to its `FILES` and increase its `CACHE`. Recipes has it already, so a change to `shared/account.js` needs a new `CACHE` in `recipes/sw.js` too.

2. Sign in, ask for an account, and sign out:

   ```js
   await Account.signIn(name, password);        // keeps the sign-in on this phone; returns { token, name, admin }
   await Account.api().signup(name, password);  // the account waits for the admin; returns { name, admin }
   Account.signOut();                           // here at once, and on the Worker
   Account.session();                           // { token, name, admin }, or null
   ```

   Errors have a `code` and a plain `message`, for example `wrong`, `waiting`, `taken`, `tries` and `network`. `Account.PROBLEMS` has the words for every code.

3. Send the sign-in with the app's own calls to the Worker:

   ```js
   fetch('/api/myapp/thing', { method: 'PUT', headers: { ...Account.headers(), 'Content-Type': 'application/json' }, body });
   ```

4. In the Worker, ask who is signed in:

   ```js
   import { json, who } from './auth.js';
   const me = await who(req, env);   // { key, id, name, admin }, or null
   if (!me) return json({ error: 'signin' }, 401);
   ```

   `key` is the account's name in lower case, as in the KV key `auth:user:<key>`. `id` tells an account apart from a removed one that had the same name; the admin has no `id`. To remember one account (as the meal plan remembers who shares a plan), keep both and check both. `adminName(env)` is the admin's name.

   When a call answers `signin`, the sign-in ended: call `Account.keep(null)` and ask the person to sign in again.

5. Test it like Recipes does: `worker/test/harness.cjs` runs the Worker in Node with KV in memory, and a Playwright route sends the page's `/api/**` requests to it.

## Setup

Do this once. `worker/README.md` has the same steps.

1. Open the Cloudflare dashboard. Go to Workers & Pages > `dorrance-api` > Settings > Variables and Secrets.
2. Add a secret `ADMIN_PASSWORD` with the admin password.
3. Open any page that has a sign-in, such as dorrance.me/recipes, and sign in as Mitchell.

## Checks

- `node --test worker/test/*.test.js` checks the accounts in the Worker and `shared/account.js`.
- A push does not deploy the Worker. After a change in `worker/`, run `npx wrangler deploy` in `worker/`.
