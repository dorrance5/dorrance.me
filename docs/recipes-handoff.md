# Handoff: Recipes page at dorrance.me/recipes

## Goal

`recipes/` is a mobile-first family recipe book that the owner edits from a phone: add, edit and delete recipes, and cook from them one step at a time.

This is version 2. Version 1, the aged recipe book with the Rolodex deck, was at dorrance.me/oldrecipes; the owner retired it on 2026-10-31, and it is gone from the repository.

## Decisions from the owner

- **Recipes is standalone.** It is not one of the apps. Do not add a `manifest.json`. It has a `sw.js` so it opens offline; increase its `CACHE` when a file it uses changes. Do not add it to the home page grid. Do not use `shared/base.css` or `shared/base.js`.
- **The theme setting is shared.** The page reads the `theme` key in localStorage (`auto`, `light`, `dark`, `aurora`) and writes `auto`, `light` or `dark`. Settings has Auto, Day and Night, with Auto on the left. This page has no Aurora look: a saved `aurora` shows as Night, with Night picked, and stays saved until another theme is picked. Do not change the format of that key.
- **Mobile first.** Phone width (390 × 844) is the main target. Desktop must work; the content is at most 640 px wide.
- **Editing must be easy.** Some recipes have amounts and steps. Some have only a list of ingredient names. Both must be valid.
- **Accounts with a name and a password.** Recipes uses the dorrance.me accounts (`docs/accounts.md`), one sign-in for the whole site. The owner is the admin. Anyone can ask for an account; it waits until the admin approves it in Settings. Approved people can add recipes, and change their own and their household’s. Reading the shared recipes needs no account.
- **Everyone has a book.** Each recipe has an owner. A recipe is shared with the family unless its owner turns that off; that is about keeping the book tidy, not about privacy (the file is public). The family’s other shared recipes are "Shared with you", and can be added to your book, where they follow the owner’s changes. To change someone else’s recipe, you edit your own copy of it. Two people who share a meal plan are a household, and share one book.
- **The design is the "Recipes v2" canvas** (a claude.ai Design artifact): a warm kitchen app. The owner approved it on 2026-10-24.

## Plan for version 2

1. **Done:** v1 moved to `/oldrecipes` (retired since). The new look: the recipe box, the recipe card, cooking mode with timers, add and edit, and Settings.
2. **Done:** the meal plan and the grocery list, kept by the Worker. Everyone signed in has their own, and two people can share one: one asks in Settings, the other says yes. See "The meal plan and the grocery list" below.
3. **Done:** import many recipes at once from a file an AI assistant makes. See "Import" below.
4. **Next:** import from a link, for signed-in people only. The Worker reads the page's schema.org Recipe data and the form fills in. (Today an AI can do this through the import file.)
- Still open: an "Add to meal plan" button on the recipe card.

## Current state

- `recipes/index.html` has the markup and the styles. `recipes/app.js` runs the page. `recipes/data.js` has the data format, the search, the amounts and timers, and the saves, and Node can test it. The page loads `shared/account.js` for the sign-in.
- `recipes/meals.js` has the meal plan's data format and changes (ops), the merged grocery list and the weeks. The page and the Worker (`worker/meals.js`) both use it, so a change to it needs a Worker deploy. Its header comment documents the format.
- `worker/recipes.js` is the Recipes part of the dorrance.me API Worker (`worker/`, on the route `dorrance.me/api/*`). It holds the GitHub token. The accounts are in `worker/auth.js`. `worker/README.md` has the setup.
- The checks are in `recipes/test/`. `CLAUDE.md` has the commands.

## Look

- Colors are tokens on `:root`, with Night under `prefers-color-scheme: dark` (when the theme is not `light`) and under `data-theme="dark"` and `"aurora"`.
  - Tomato `#C63A24` with cream `#FFF6E6` text; butter `#F6C945` and carrot `#E07B2E` with ink `#2A1D17` text.
  - Day: cream ground `#FBF3E4`, surface `#FFFBF4`, ink `#2A1D17`, soft text `#6B5348`, lines `#E8D9BF`, input borders `#9C826A`, focus ring `#2F6FD0`.
  - Night: ground `#1C1512`, surface `#2A201B`, text `#F6EBDA`, soft `#C8B6A3`, lines `#3D3029`, links `#F2836B`, focus ring `#8FB8FF`.
- Fonts: Fraunces (`'SOFT' 100`, weight 800 for titles) and Figtree for the rest. They come from Google Fonts but are kept in `recipes/fonts/` (latin and latin-ext), so the page does not load them from Google.
- **Category colors.** Four colors, each with text at 4.5:1 or more: tomato `#C63A24` (cream text), carrot `#E07B2E`, butter `#F6C945` (ink text) and rust `#A94A1A` (cream text). Soup is tomato, Crock pot is carrot, and a recipe with no category is butter. Any other category gets one of the four, picked by a hash of its name, so it keeps its color. A recipe takes the color of its first category.

## Screens

1. **Recipe box.** A tomato header: "Dorrance Family" over "Recipe Book", a search field, and on the right a butter + (signed in) or a "Sign in" pill (signed out). Under it, divider tabs that stick to the top: All on the left, then each category A to Z, each with its count. The open tab is taller and filled with its color, and a band of that color runs under the tabs. Then the deck: cards 104 px tall that overlap so that each shows a 58 px strip with its name and its first category. A search shows why each card matched (the ingredients, a piece of a step or note, or a category) under the name, and that card's strip grows to show it.
   - The deck is your book: your recipes, your household’s, and the shared ones you added. Signed out, it is every shared recipe.
   - Signed in, under the deck: "Shared with you", the family’s shared recipes that are not in your book (the search finds them too). Each row has the name, "Nicole’s recipe" and Add; the name opens the recipe.
2. **Recipe card.** "‹ Recipe box" (or "‹ Meal plan" when it opened from the plan) and, signed in, a pencil to edit. An index card: a strip in the recipe's color, chips for the categories and "Serves" with "Contributed by Nicole" (the `owner`; none for a recipe with no owner) at the right end of that row, the name, a red rule, an Ingredients · N / Steps · N switch (only when there are steps), then the list on blue lines. The amount at the start of each ingredient is bold, and 1/4 shows as ¼. Below: "Start cooking" (only with steps); signed in, for a recipe with ingredients, "Add to grocery list" (butter, with a basket), which turns into "On the grocery list" (outlined, with a tick); the notes on butter, and "From saltandlavender.com ↗" (a link opens in a new tab; text that is not a link shows as "From Grandma Dorrance").
3. **Cooking mode.** Slides up. × to leave, the recipe name, and Ingredients (a sheet over the step). A progress bar, "Step N of M", the step in large Fraunces, Back and Next step (Done on the last step, which goes back to the card). The left and right arrow keys move between steps.
   - **Timers.** The first time a step names ("5 minutes", "10 to 15 minutes", "20-25 mins", "6 hours", "1 hour 30 minutes", "30 seconds") gives the step a timer, starting at the shorter time of a range. Start, Pause, Resume, Again and Reset. A timer keeps running on another step. Every timer on another step that has started shows at the top, three across (more wrap), in step order, with its time ("Done" when it is up); a tap goes back to that step. At the end the step says "Time’s up", and a tomato bar at the top says "Time’s up · Step 4" (or "Steps 2, 4") and "Tap to stop". It beeps and buzzes every 2 seconds for a minute, or until the bar is tapped or that timer gets Again or Reset; the bar stays until it is tapped. Leaving cooking mode while a timer runs asks first, and leaving stops the timers.
4. **Add and edit.** A full screen: Cancel, "New recipe" or "Edit recipe", Save. Fields: Name, Category (chips: None on the left, each category in the box, and "New" for a new one; more than one can be picked, and the first picked colors the card), Serves, Ingredients and Steps (one per line, with a count), Notes, and "Where it’s from" (a link, a cookbook or a person). Pasted lists lose their `-`, `•`, `*`, `1.` and `1)` marks. Last, a "Share with the family" switch, on for a new recipe, with a line that says who sees it. Edit has "Delete recipe", which asks for a second tap.
   - The pencil on someone else’s recipe opens "Your copy": the recipe, named "Megan's zuppa toscana (Madi's version)", with no Delete. Saving adds the copy as yours, in the place of the original in your book. Cancel or the back button with changes asks first.
5. **Settings.** A tab for anyone signed in; for someone signed out, a screen with "‹ Recipe box". Opened over the editor to sign in again during a save, it has "‹ Back" and no tab bar.
   - Signed in: a card with who is signed in ("Admin · signed in" or "Signed in") and Sign out.
   - The admin: "Waiting for you" (a card for each account that waits, with Approve and Deny), then "Accounts" (each with Remove). Deny and Remove ask for a second tap. A dot on Settings in the tab bar while accounts wait.
   - Signed in, after the admin's groups: "Meal plan and grocery list". Not sharing: "Share your meal plan and grocery list with one other person. They join when they say yes." and a chip for each other account; a tap asks that person. Asked someone: their face, "Waiting for Madi to say yes" and Cancel. Sharing: their face, "Shares your meal plan and grocery list" and Stop sharing, which asks for a second tap. Asked by someone: above that, a card "Hayden asked to share" with Join and No thanks (and, if you share with someone now, that you stop sharing with them), and a dot on Settings in the tab bar.
   - Signed out: "Sign in", or "Ask for an account" with "New here? Ask for an account".
   - "Theme on this phone": Auto, Day, Night.
   - Signed in, after "Meal plan and grocery list": "Import recipes", which opens the import screen.
   - The admin, last: "Categories", each category in the file A to Z with its color and "N recipes", and Edit. Edit opens the name, the four colors, Save, Cancel and Delete (a second tap). Save renames the category on every recipe (into another category if one has the new name) and keeps a picked color in `colors`; Delete takes it off every recipe, and the recipes stay. Each is one commit: `Recipes: rename category Crock pot to Slow cooker rust (Mitchell)`, `Recipes: color category Grill butter`, `Recipes: delete category Grill`. Only the page hides it from others: the Worker takes any save from someone signed in, as it does for recipes.
6. **Import.** A full screen: Cancel, "Import recipes", Import N. A card "Let an AI do the typing" with three steps, the message to send the AI (it names `/recipes/import.txt`) and "Copy the message". Then "Choose the file" (.json, .txt or .md) and "Or paste it here". When the text reads, "N recipes in the file" with Untick all, a row per recipe with a checkbox, its name and "7 ingredients · 4 steps · Bread", and the "Share with the family" switch. A recipe with the same name as one in your book starts unticked, with "Already in your book". It opens from Settings, or from "Have a lot of recipes? Import a file" in the New recipe editor.
7. **Tab bar.** Signed in: Recipes, Meal plan, Grocery list and Settings, on the box and on the tabs. The meal tabs show once the plan has loaded. Signed out: no tab bar. From the box a tab opens over it; from one tab, the next takes its place at the same history depth, so the back button goes to the box.
8. **Meal plan.** A carrot header: "Meal plan", "Dinners for Mitchell and Nicole" and their faces, and a This week / Next week switch with the dates. Then Monday to Sunday: the day and its number (today in tomato), and the dinner. A recipe is colored like its card, and its name opens it; a note ("Leftovers") is on the surface color. Each shows a small face for who planned it, and an × to clear the day. An empty day has a dashed "Plan dinner", which opens a sheet: "Dinner on Saturday, Oct 24", Close, a search, the recipes A to Z with a dot in their color, and "Or write something, like Leftovers" with Add. At the bottom, "Put N dinners on the grocery list" adds the week's recipes from today on that are not on the list yet, and opens the list; when there are none left to add, "Open the grocery list".
9. **Grocery list.** A butter header: "Grocery list", "3 recipes · 12 to get", a chip for each recipe on the list with an × to take it off, and a dashed "Add a recipe" that goes to the box. "Add something else", then "To get": a checkbox per item, with the amounts and "For <recipes>" (or "Extra") under the name. The same item from two recipes is one line ("Buns"). Ticked items go to "Got it", struck through, with Clear. Empty: "Nothing on the list. Open a recipe and tap Add to grocery list."
   - At night the carrot and butter headers keep their colors, with ink text; the rest uses the Night colors.

## The meal plan and the grocery list

- Everyone signed in has their own plan, and two people can share one (pairs only). One asks in Settings; the other sees the ask and says Join or No thanks. A shared plan starts as a copy of the asker's. Either one can stop sharing: the one who stays keeps the shared plan, and the one who leaves gets their own back. Saying yes while sharing with someone else stops that sharing, and that person keeps the plan. No one else sees a plan, the admin included.
- Plans are private, so the Worker keeps them in KV (`meals:plan:ID`, and `meals:me:KEY` for who shares and who asked), never in the public repository. `worker/meals.js` lists the routes: `GET` and `POST /api/meals`, `GET /api/meals/people` (who can be asked: a KV list, when Settings opens) and `POST /api/meals/share` (ask, cancel, join, decline, leave).
- A signed-in page load asks once with a GET, which only reads. The page keeps the answer and the changes not sent yet in localStorage (`recipes-meals`, for that name), so the tabs show at once, and shows the answer with those changes on top (`Meals.apply`).
- Each change is an op (`recipes/meals.js`). The page sends them in batches: one POST at a time, at most one each 1.2 s. The Worker applies a batch to the newest data, so two phones do not undo each other. Each POST is one KV read and one write.
  - `busy` (429: the other phone saved in the same second): send again in 1.5 s.
  - No connection, `full` (503: the day's free KV writes are used up) or another error: keep the changes, show "… Your changes are kept on this phone and sent later.", and try again later, or at once when the phone is back online or the page is shown again.
  - `body` (400): drop that batch and read again. `signin` (401): sign out.
- Asking, saying yes and stopping wait until the changes on their way are sent, and their answer counts as newer than a GET on its way. Settings reads the plan again when it opens, so it shows who shares now.
- A GET that was sent before a POST ended is ignored, since the POST's answer is newer. While a meal screen shows, the page reads again every 30 s and when it is shown again. When the page is hidden, it sends what is left with `keepalive`.
- Signing out forgets what the phone kept.

## Data format

`recipes/recipes.json` is the only copy of the recipes. The page reads it. The owner's Claude chats also read and edit it.

```json
{
  "recipes": [
    {
      "id": "megans-zuppa-toscana",
      "name": "Megan's zuppa toscana",
      "servings": "6",
      "tags": ["Soup"],
      "ingredients": ["5 strips bacon (thick-cut)", "1 lb Italian sausage (casings removed)"],
      "steps": ["Cut the bacon into small pieces."],
      "notes": "Half-and-half works in place of cream.",
      "source": "https://www.saltandlavender.com/sausage-bacon-potato-and-kale-soup/"
    }
  ]
}
```

- Only `id`, `name` and `ingredients` are required. Leave out the other fields when they are empty.
- `tags` are the categories shown on the page. "Soup" and "soup" are one category.
- `ingredients` can be an empty array. The page shows "No ingredients yet." for an empty array.
- `source` is a link, or plain text such as a cookbook or a person. Text that looks like a web address without `https://` gets it; other text stays as typed.
- Make the `id` from the name: lower case, remove apostrophes, put a hyphen in place of other characters that are not letters or numbers. If the `id` already exists, add `-2`, `-3` and so on.
- `owner` is the name of the account the recipe belongs to, as it signs in ("Nicole"). A new recipe gets the name of whoever adds it; when you add one from a Claude chat, set `owner` to the person it is for. A recipe with no owner belongs to everyone: anyone signed in can change it.
- `"shared": false` keeps a recipe out of "Shared with you" and away from people who are signed out. Leave the field out for a shared recipe.
- `colors` (next to `recipes`) holds the colors the admin picked, by the category in lower case: `"colors": { "grill": "rust" }`. The colors are `tomato`, `carrot`, `butter` and `rust`. Leave it out when it is empty.
- `books` (next to `recipes`) lists, for each account by its name in lower case, the ids of the shared recipes of others that it added to its book: `"books": { "madi": ["megans-zuppa-toscana"] }`. Leave it out when it is empty.
- Fields the page does not know are kept when a recipe is edited.
- Write the file with 2-space indentation and a newline at the end, so that the diffs are easy to read.

## Import

- `recipes/import.txt` is the instructions for an AI assistant: the file format, the rules for photos, links and cookbooks, and how the person imports the file. The page links it with `<link rel="help">` and a hidden line at the top of the body, so an AI that opens `dorrance.me/recipes` finds it. Keep it in step with `parseImport`.
- The format: `{ "dorranceRecipes": 1, "recipes": [ { name, servings, tags, ingredients, steps, notes, source } ] }`. Up to 500 recipes in one import (`MAX_IMPORT`).
- `parseImport(text)` in `recipes/data.js` also takes the JSON inside ```json code blocks (several are joined) or with chat text around it, a bare list, one recipe, and schema.org Recipe data (`recipeIngredient`, `recipeInstructions` with HowToStep and HowToSection, `recipeYield`, `recipeCategory`, `@graph`). It drops list marks and step numbers. Recipes with no name are left out and counted.
- The save is one change, `{ type: 'import', forms, shared }`, so a whole cookbook is one commit: `Recipes: import N recipes (<person>)`. Each recipe gets a new `id` and the importer as `owner`.

## How saving works

The site is static, so the page saves through the API Worker, and the Worker saves to GitHub with the contents API.

- The page calls `/api/recipes/file` with `Authorization: Bearer <sign-in>`. `worker/recipes.js` lists its routes.
- The Worker calls `https://api.github.com/repos/dorrance5/dorrance.me/contents/recipes/recipes.json` with the GitHub token in the secret `GITHUB_TOKEN`: a fine-grained personal access token for the `dorrance5/dorrance.me` repo only, with "Contents: Read and write". The token never goes to a phone. The page deletes an old `recipes-token` that it finds in localStorage.
- Keep the last good copy of the data under `recipes-cache`.
- Save steps:
  1. GET the file. Read `content` and `sha`.
  2. Decode the content as base64 UTF-8. Do not use plain `atob`. It breaks non-ASCII text.
  3. Apply the one change (add, edit or delete one recipe by `id`) to the data from step 1. Do not save the whole local copy. This keeps the edits that Claude makes from chat.
  4. PUT `message`, `content` (base64 UTF-8) and `sha`. The Worker checks that the content is JSON with a `recipes` list, adds the person's name to the message, and commits to `main`.
  5. If the PUT returns 409, do steps 1 to 4 one more time.
- Commit titles: `Recipes: add <recipe> (<person>)`, `Recipes: edit <recipe> (<person>)`, `Recipes: delete <recipe> (<person>)`, `Recipes: import N recipes (<person>)`.
- Each save starts a Pages deploy. The live file updates in about 1 minute. Signed in, the page loads the data through the Worker, so the change shows at once. Signed out, it loads `recipes.json` from the site.
- Show plain errors. `recipes/data.js` has the words for each error code from the Worker, for example:
  - signed out: "You are signed out. Sign in again." with a "Sign in again" button that opens Settings over the editor.
  - a bad GitHub token in the Worker: "The recipe book cannot reach GitHub. The admin needs to check its GitHub token."
  - no connection: "No connection. The change is not saved."
- **Waiting accounts.** `GET /api/auth/me` counts them with a KV list, so a page load asks at most once every 6 hours (`recipes-waiting` in localStorage). Opening Settings as the admin always loads the list.

## Mobile rules

- Set inputs and textareas to a font size of 16 px or more, so that iOS does not zoom.
- Make tap targets 44 px or more. In the deck, each card's visible strip is 44 px or more.
- Use `env(safe-area-inset-*)` on the header, the screens, the tab bar and cooking mode.
- Meta tags: `apple-mobile-web-app-capable`, `mobile-web-app-capable`, `apple-mobile-web-app-title` = "Recipes", and one `theme-color` that the page sets to the color at the top of the screen (tomato on the box).
- Each screen over the box is one history entry, so the phone's back button closes it. A tapped card gets the focus back when its recipe closes.
- Keep the screen on (wake lock) while a recipe or cooking mode is open, and accept a refusal.
- Do not let the page scroll sideways at 390 px. The divider tabs scroll sideways inside their row when there are many.
- Respect `prefers-reduced-motion`: the screens appear without sliding.

## Icon

- The icon is still version 1's: a cream bowl (`#f4e5c6`) with three steam lines on sepia brown. A tomato version would fit version 2 better; the owner has not asked for it yet.
- `recipes/favicon.svg`: a rounded square (radius 14 on a 64 viewBox). `recipes/favicon-32.png` and `recipes/apple-touch-icon.png` (180 × 180, full bleed) are rendered from `docs/icons/recipes.svg` and `recipes/favicon.svg` by `docs/icons/render-recipes.cjs`.

## Rules

- Follow `CLAUDE.md` for pushes, commits and costs. Start each commit title with `Recipes:`.
- Do not change other apps, `shared/`, or the home page.
- Do not put the GitHub token, a password or a sign-in in the repo, in a URL, or in a log.

## How to check

1. Run the unit tests, the browser checks and the screenshots in `CLAUDE.md`, for `recipes/`. Look at the screenshots in Day and in Night.
2. The browser checks run the Worker in Node with KV in memory and a stand-in for GitHub (`worker/test/harness.cjs`), and route the page's `/api/**` requests to it. They cover: the box, dividers and search; the recipe card; cooking mode and its timers (on a test clock); the theme; asking for an account, signing in, a wrong password, an account that waits; approve, deny and remove as the admin; add, edit and delete; a 409 on the first PUT; a sign-in that ended, a bad GitHub token and no connection; the back button; tap sizes and sideways scroll. Then the meal plan on three phones (Mitchell, Jen and Nicole, on Saturday, Oct 24, 2026): asking, No thanks, the dot, Join, the plan and the picker, the grocery list and its merged items, batches, no connection, a busy Worker, Night, Stop sharing, a removed account, and signing out.
   - The browser checks use `recipes/test/fixture-recipes.json`, a frozen copy of the recipe book, in place of `recipes/recipes.json`, so the family's edits do not change what they expect. The screenshots use the real book.
3. There must be no console errors.
4. Push, then check that the "Deploy static content to Pages" run starts.

## Setup for the owner

Do this once, after the Worker is deployed. `worker/README.md` has the same steps.

1. Make a GitHub token: open https://github.com/settings/personal-access-tokens/new. Set "Repository access" to "Only select repositories" and select `dorrance5/dorrance.me`. Under "Permissions", set "Contents" to "Read and write". Generate the token and copy it.
2. Open the Cloudflare dashboard. Go to Workers & Pages > `dorrance-api` > Settings > Variables and Secrets.
3. Add a secret `GITHUB_TOKEN` with the token.
4. Add a secret `ADMIN_PASSWORD` with the admin password, for the dorrance.me accounts.
5. On the phone, open dorrance.me/recipes. Tap Sign in. Sign in as Mitchell with that password.
