# Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved mobile redesign (`docs/design/Redesign.dc.html`) across the React frontend, consuming the new backend APIs, folding in all frontend bug fixes from the assessment.

**Architecture:** New app shell with a bottom tab bar (Home / Cards / Stats / Guides); screens rebuilt per the design file's sections; theme via CSS custom properties (dark default, light variant). All scoring/data comes from the backend — no client-side evaluation. Card art from `/cards/<set>/<id>.jpg` with an engraved-monogram fallback component.

**Tech Stack:** React 19 + TypeScript (strict) + Vite + Tailwind v4 + framer-motion + react-router v7 (HashRouter). NEW dev deps (approved in spec): vitest, @testing-library/react, @testing-library/user-event, jsdom.

## Global Constraints

- Working dir for frontend commands: `/Users/nilrehsttam/Repos/slovak-learning/frontend`
- Type-check: `npx tsc -b --noEmit` must stay clean after every task. Build: `npx vite build` must succeed.
- Tests: `npx vitest run` — logic-bearing components get tests; pure-visual markup does not.
- **The design file is the visual spec:** `docs/design/Redesign.dc.html`. Each task names its section by the HTML comment marker (e.g. `<!-- 2a Home Focus -->`). Read that section before building the screen; match its layout, spacing, and copy. Colors/fonts: extract exact values from the section's inline styles — do not invent.
- Fonts: Inter (UI), JetBrains Mono (pronunciations/numbers), Cinzel (card monograms) via Google Fonts in `index.html`.
- Base theme: background `#0a0b10`, accent `#5ea4f7` (verify per-section values in the design file).
- Backend API base: existing `src/lib/api.ts` client (`VITE_API_URL`). Backend runs on :8888 (`cd ../backend && .venv/bin/python -m uvicorn app.main:app --port 8888`).
- New backend contracts this plan consumes:
  - `GET /api/users/{id}/recommendations` → `{ in_progress_session: {id,mode,topic,difficulty,created_at}|null, due_words: number, weakest_concept: {concept,accuracy,times_seen}|null, recommended: Array<{kind:"continue"|"review_vocab"|"practice_concept", label, mode, session_id?}> }`
  - `POST /api/users/{id}/cards/trade-in` body `{card_ids:number[]}` → `{traded:number[], xp_gained:number}` (400 when not duplicated)
  - `PUT /api/users/{id}/showcase` body `{card_id:number|null}` → `{ok:true}` (400 when not owned)
  - Pack purchase now returns 5 cards + `copies: Record<string, number>`; cards may have rarity `"mythic"`; `/api/cards/social` entries include `showcase_card_id`
  - Session exercises now include `credits: (number|null)[]` (vocab+grammar) and `tiers: (string|null)[]` (grammar; values "exact"|"accent"|"wrong")
  - Session feedback `overall_score`/`scores` are backend-computed for vocab/grammar/translation
- Commit after each task: conventional format, lowercase, no co-author lines, user's git identity, on branch `release/learning-loop-redesign`.
- Card art: `/cards/<set_id>/<card_id>.jpg` under `frontend/public/` (being populated by sourcing agents; ALWAYS render the monogram fallback when the image is missing/404s).

---

### Task F1: Foundations — vitest, theme tokens, ErrorBoundary, api client extensions

**Files:**
- Modify: `frontend/package.json` (add dev deps + `"test": "vitest run"` script), `frontend/vite.config.ts` (vitest config), `frontend/src/index.css` (theme custom properties), `frontend/index.html` (fonts), `frontend/src/lib/api.ts`, `frontend/src/lib/types.ts`, `frontend/src/App.tsx` (wrap in ErrorBoundary)
- Create: `frontend/src/components/ErrorBoundary.tsx`, `frontend/src/test/setup.ts`
- Test: `frontend/src/lib/__tests__/api.test.ts`, `frontend/src/components/__tests__/ErrorBoundary.test.tsx`

**Interfaces:**
- Produces: `getRecommendations(userId): Promise<Recommendations>`, `tradeInCards(userId, cardIds): Promise<TradeInResult>`, `setShowcase(userId, cardId|null): Promise<void>` in api.ts; types `Recommendations`, `RecommendedAction`, `TradeInResult` in types.ts; `credits`/`tiers` added to `VocabExerciseData`/`GrammarExerciseData`; `"mythic"` added to the rarity union; CSS custom properties `--bg`, `--surface`, `--text`, `--accent`, etc. on `:root` (dark) and `[data-theme="light"]`; `<ErrorBoundary>` with fallback UI + reload button.

- [ ] Install dev deps: `npm i -D vitest @testing-library/react @testing-library/user-event jsdom` (versions: latest compatible).
- [ ] Add vitest config to `vite.config.ts` (`test: { environment: "jsdom", setupFiles: "./src/test/setup.ts", globals: true }`).
- [ ] Write failing tests: ErrorBoundary renders children normally and shows fallback (with "reload" text) when a child throws; api.test.ts asserts `getRecommendations` hits `/api/users/u1/recommendations` (mock `fetch`, assert URL + parsed result passthrough), `tradeInCards` POSTs `{card_ids}`, `setShowcase` PUTs `{card_id}`.
- [ ] Run `npx vitest run` → RED (modules missing).
- [ ] Implement: ErrorBoundary (class component, `componentDidCatch`, fallback matches app theme); api.ts functions following the existing fetch-wrapper pattern in that file; types.ts additions; theme custom properties in index.css extracted from the design file's `<!-- ══ HOME ══ -->` and body styles; fonts link tags in index.html.
- [ ] Wrap the router's shell in `<ErrorBoundary>` in App.tsx.
- [ ] `npx vitest run` GREEN; `npx tsc -b --noEmit` clean; `npx vite build` succeeds.
- [ ] Commit: `feat: frontend foundations — vitest, theme tokens, error boundary, new api endpoints`

---

### Task F2: App shell — bottom tab bar + route restructure

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/TabBar.tsx`
- Design section: `Redesign Tab Bar.dc.html` layout is embedded in each screen mock of `Redesign.dc.html` (bottom of the `2a Home Focus` frame) — replicate that bar.
- Test: `frontend/src/components/__tests__/TabBar.test.tsx`

**Interfaces:**
- Produces: `<TabBar/>` fixed bottom nav with 4 items — Home `/`, Cards `/cards`, Stats `/stats`, Guides `/guides` — active-state styling per design; routes `/dashboard`, `/history`, `/leaderboard` become `<Navigate>` redirects to `/stats?tab=...`; `/farm` remains reachable from Cards screen (link), not the tab bar; Session route `/session/:id` renders WITHOUT the tab bar (full-screen).

- [ ] Failing test: TabBar renders 4 links with correct hrefs; active tab gets `aria-current="page"`.
- [ ] RED → implement TabBar (framer-motion active indicator per design) → route changes in App.tsx with redirects → GREEN.
- [ ] `npx tsc -b --noEmit` clean; build succeeds.
- [ ] Commit: `feat: bottom tab bar shell with stats redirects`

---

### Task F3: Home "2a Focus" screen + skeleton

**Files:**
- Modify: `frontend/src/pages/Home.tsx` (full rewrite)
- Create: `frontend/src/components/HomeSkeleton.tsx`
- Design sections: `<!-- 2a Home Focus -->`, `<!-- Home skeleton -->`
- Test: `frontend/src/pages/__tests__/Home.test.tsx`

**Interfaces:**
- Consumes: `getRecommendations` (F1), existing `getDashboard`.
- Produces: Home renders — Slovak date header (`Streda · 16. júla` — use `Intl.DateTimeFormat("sk-SK", {weekday:"long", day:"numeric", month:"long"})`), greeting `Ahoj, {user.name}`, streak chip, avatar; **Continue card** when `in_progress_session` exists (navigates to `/session/{id}`); **Recommended chip(s)** for `review_vocab`/`practice_concept` (start the suggested mode via the config sheet from F4); mode grid with live stats (words learned, avg score per mode from dashboard data). Loading → `<HomeSkeleton/>` (shimmer per design). Fetch errors → inline error state, NOT the hardcoded "port 8888" message (bug fix #20) — generic copy + retry button. `loadData` in `useCallback` (bug fix #21).

- [ ] Failing tests: renders Continue card when recommendations include in_progress_session (mock api); renders no Continue card otherwise; shows error state + retry on fetch rejection.
- [ ] RED → implement per design section → GREEN; `tsc` clean; build succeeds.
- [ ] Manual check: `npm run dev` against live backend; Home shows real recommendations for matt.
- [ ] Commit: `feat: redesigned home with continue card and recommendations`

---

### Task F4: Session config bottom sheet

**Files:**
- Create: `frontend/src/components/ConfigSheet.tsx`
- Modify: `frontend/src/pages/Home.tsx` (mode tap opens sheet), remove/replace the existing setup flow entry point (check `src/pages/` for the current setup page; keep its route redirecting into Home+sheet)
- Design section: `<!-- Config bottom sheet -->`
- Test: `frontend/src/components/__tests__/ConfigSheet.test.tsx`

**Interfaces:**
- Produces: `<ConfigSheet mode difficulty topics onStart onClose/>` — slides up (framer-motion), difficulty pills (Beginner/Intermediate/Advanced), optional topic chips (from `GET /api/topics/{mode}`), focus-area free-text entry (respect backend caps: max 10 items × 100 chars — validate client-side), Start button calls existing `createSession` and navigates to `/session/{id}`; `recommendedTopic` prop pre-selects when launched from a Recommended chip.

- [ ] Failing tests: renders 3 difficulty pills; Start calls createSession with selected values; focus-area input rejects >100 chars.
- [ ] RED → implement per design → GREEN; `tsc` clean; build.
- [ ] Commit: `feat: session config bottom sheet`

---

### Task F5: Vocab quiz redesign (+ retry progress fix)

**Files:**
- Modify: `frontend/src/components/VocabMode.tsx` (rewrite per design)
- Design section: `<!-- Vocab quiz redesign -->`
- Test: `frontend/src/components/__tests__/VocabMode.test.tsx`

**Interfaces:**
- Consumes: session exercises with `credits`; existing `submitVocabAnswer` api.
- Produces: design layout — progress dots, big prompt word with pronunciation hint (JetBrains Mono), 4 choice buttons, correct → green state + `Správne! +10 XP` toast + Continue button; wrong → reveal correct. **Bug fix #7:** retry-phase progress derived from `answers`/`retryQueue` state, never `retryQueue.indexOf(currentIndex)`; show `Retry round · {answered}/{total}`. Narrow `session.exercises` via the discriminant (`exercises?.type === "vocabulary"`) instead of a bare `as` cast (bug fix #8). Keep `endingRef` guard (sync ref, not state) for end-session double-fire (bug fix RISK).

- [ ] Failing tests: retry-phase progress label correct for a seeded retry state; discriminant narrowing returns null-render for mismatched exercises type.
- [ ] RED → implement → GREEN; `tsc` clean; build.
- [ ] Commit: `feat: redesigned vocab quiz with fixed retry progress`

---

### Task F6: Grammar mode — partial credit UI + XSS fix

**Files:**
- Modify: `frontend/src/components/GrammarMode.tsx`
- Test: `frontend/src/components/__tests__/GrammarMode.test.tsx`

**Interfaces:**
- Consumes: grammar answers now return `credits`/`tiers`; accent tier means "correct but partial".
- Produces: **XSS fix (bug #4):** replace `dangerouslySetInnerHTML` — split `exercise.sentence` on `"____"` and render `<strong className="text-mode-grammar">{blank}</strong>` as JSX. **Tier UI:** after submit, tier `"accent"` → amber "Takmer! Watch the diacritics: **{blank}**" state (per feedback-redesign styling), `"exact"` → green, `"wrong"` → red with correct answer. **Bug fix #5:** wrap `handleStartExercises`/`handleSelect` in try/catch with visible error state. Keep the lesson→exercises flow; sonnet-era layout may be restyled to match quiz design idioms (progress dots, buttons) but the design file has no dedicated grammar mock — reuse the vocab-quiz section's visual language.

- [ ] Failing tests: sentence containing `<img onerror>` renders as TEXT (no element injected — assert via queryByRole/innerHTML absence); accent-tier response shows "Takmer" note; API error in start shows error state.
- [ ] RED → implement → GREEN; `tsc` clean; build.
- [ ] Commit: `feat: grammar partial-credit ui, remove html injection`

---

### Task F7: Feedback redesign

**Files:**
- Modify: `frontend/src/components/FeedbackView.tsx` (rewrite per design)
- Design section: `<!-- Feedback redesign -->`
- Test: `frontend/src/components/__tests__/FeedbackView.test.tsx`

**Interfaces:**
- Consumes: backend-computed `overall_score` + `scores[]` (categories like "Word recognition (SK→EN)", "Diacritics").
- Produces: score ring (animated, framer-motion) with `7.0 / out of 10` + Slovak encouragement word (`Dobre!` etc. — thresholds: ≥9 `Výborne!`, ≥7 `Dobre!`, ≥5 `Pokračuj!`, else `Skús znova!`); Breakdown bars per category with comment lines; strengths/improvements sections; vocabulary-learned list; mode/topic/difficulty chips — all per the design section.

- [ ] Failing tests: renders category bars for provided scores; encouragement word matches thresholds (test ≥9, ≥7, <5 cases).
- [ ] RED → implement → GREEN; `tsc` clean; build.
- [ ] Commit: `feat: redesigned session feedback with computed breakdown`

---

### Task F8: Stats hub (merges Dashboard / History / Leaderboard)

**Files:**
- Create: `frontend/src/pages/Stats.tsx`
- Modify: `frontend/src/App.tsx` (route `/stats`), reuse content from `Dashboard.tsx`, `History.tsx`, `Leaderboard.tsx` (import their extracted content components; delete pages only after extraction compiles)
- Design section: `<!-- Stats hub -->`
- Test: `frontend/src/pages/__tests__/Stats.test.tsx`

**Interfaces:**
- Produces: `/stats?tab=overview|history|friends` — segmented tabs per design. Overview: XP race bar chart (per-user XP from leaderboard), streak/avg/words/sessions stat cards, by-category scores. History: existing session list with delete (bug fix #6: try/catch + rollback on failed delete). Friends: leaderboard entries + head-to-head picker (keep existing h2h feature; bug fix #22: clear stale selection when both pickers select same user). **Bug fix #10:** every fetch gets `.catch` → error state + retry. Old routes redirect (F2).

- [ ] Failing tests: tab switching renders correct panel; failed leaderboard fetch shows retry UI; history delete failure keeps the session in the list.
- [ ] RED → implement → GREEN; `tsc` clean; build.
- [ ] Commit: `feat: stats hub merging dashboard, history, leaderboard`

---

### Task F9: Guides redesign + read tracking

**Files:**
- Modify: `frontend/src/pages/Guides.tsx`
- Design section: `<!-- Guides redesign -->`
- Test: `frontend/src/pages/__tests__/Guides.test.tsx`

**Interfaces:**
- Produces: guide cards with section counts + read progress (`4 sections · 2 read`) per design; per-section read state in `localStorage` key `guides:read:<userId>` (array of section ids), marked when a section is expanded; replace the bespoke `line.startsWith('**')` parser with `<ReactMarkdown>` (bug fix — dead-code item; react-markdown already a dep).

- [ ] Failing tests: expanding a section persists read state to localStorage; progress count renders from stored state.
- [ ] RED → implement → GREEN; `tsc` clean; build.
- [ ] Commit: `feat: guides with read tracking`

---

### Task F10: Card frame components + art pipeline

**Files:**
- Create: `frontend/src/components/cards/CardFrame.tsx`, `frontend/src/components/cards/CardArt.tsx`, `frontend/src/components/cards/rarity.ts`
- Design sections: `<!-- Common -->` through `<!-- New card back -->` (all six frame variants + card back)
- Test: `frontend/src/components/cards/__tests__/CardFrame.test.tsx`

**Interfaces:**
- Produces:
  - `rarity.ts`: `RARITY_ORDER`, per-rarity theme map (frame colors, shapes: rare = chamfered corners, legendary = cathedral arch, mythic = gem cartouche + prismatic animation, per design sections).
  - `<CardArt card/>`: `<img src={`/cards/${card.set_id}/${card.id}.jpg`}>` with `onError` → engraved Cinzel monogram fallback (first letter of `slovak`, per design's `{{ artCommon }}` slot styling). Never a broken-image icon.
  - `<CardFrame card size?>`: full card render — set name header, art slot, slovak + pronunciation + english, example quote, number `#{number}/016` derived from catalog set size (bug fix #13 — no hardcoded denominators), rarity label, foil/glow animations for legendary/mythic (CSS keyframes from the design file header: `legendary-glow`, `mythic-shift`, `holo-shift`).
- Consumes: card shape from `/api/cards/all` (has `set_id`, `number`, `rarity` incl. `"mythic"`).

- [ ] Failing tests: art img error swaps to monogram fallback (fire error event, assert fallback text); mythic rarity gets its frame class; denominator derives from set card count prop (pass 16 → `/016`).
- [ ] RED → implement (copy keyframes/colors from design file) → GREEN; `tsc` clean; build.
- [ ] Commit: `feat: card frames with rarity shapes, art slots, monogram fallback`

---

### Task F11: Cards screens — Shop + Binder + Friends

**Files:**
- Modify: `frontend/src/pages/Farm.tsx` → split: create `frontend/src/pages/Cards.tsx` (Shop/Binder/Friends tabs per design), keep Farm as its own page linked from Cards; extract `BinderSkeleton`
- Design sections: `<!-- Shop -->`, `<!-- Binder -->`, `<!-- Binder skeleton -->`, and the social part of `<!-- Trade-in + showcase -->`
- Test: `frontend/src/pages/__tests__/Cards.test.tsx`

**Interfaces:**
- Consumes: `/api/cards/catalog`, `/api/users/{id}/cards`, `/api/cards/social` (now with `showcase_card_id`), CardFrame/CardArt (F10).
- Produces: Shop tab — foil pack tiles per set (emoji, name, `8C · 4U · 2R · 1L+` composition line, cost 150, per-set progress `9/15`, COMPLETE badge); Binder tab — album grid by set: owned cards as mini CardArt tiles, unowned as numbered empty slots, `copies ×N` badge for duplicates; Friends tab — user rows with card counts, set progress, showcase card thumbnail. **Bug fixes:** #12 totals derive from catalog (`sets.reduce`), no hardcoded 150; resize-stale carousel replaced by the binder grid (design dropped the carousel); pack-purchase state guarded against unmount (AbortController/ref, bug #Farm-845).

- [ ] Failing tests: set progress fraction derives from catalog data; duplicate badge shows for copies>1; unowned slot renders number not art.
- [ ] RED → implement → GREEN; `tsc` clean; build.
- [ ] Commit: `feat: cards screens — shop, binder, friends with showcase`

---

### Task F12: Pack opening — swipe-to-tear

**Files:**
- Create: `frontend/src/components/cards/PackOpening.tsx`
- Modify: `frontend/src/pages/Cards.tsx` (wire purchase → opening flow)
- Design section: `<!-- Pack opening -->`
- Test: `frontend/src/components/cards/__tests__/PackOpening.test.tsx`

**Interfaces:**
- Consumes: pack purchase response `{cards (5), new_card_ids, duplicate_card_ids, copies, xp_cost}`.
- Produces: state machine `sealed → tearing → revealed → done`: foil pack with `POTIAHNI` swipe strip (framer-motion drag; keyboard/tap fallback button for accessibility), tear → cards fan out face-down, tap to flip each (flip animation; rarity decides glow), NEW badge on first-copy cards, duplicate badge + `+XP on trade-in` hint on dupes; Continue → binder. Unmount mid-flow cancels cleanly (no setState-after-unmount).

- [ ] Failing tests: state machine transitions (simulate drag end past threshold → revealed); flipping all 5 enables Continue; dupes get duplicate badge from `new_card_ids` diff.
- [ ] RED → implement → GREEN; `tsc` clean; build.
- [ ] Commit: `feat: swipe-to-tear pack opening with card flips`

---

### Task F13: Trade-in sheet + showcase picker

**Files:**
- Create: `frontend/src/components/cards/TradeInSheet.tsx`, `frontend/src/components/cards/ShowcasePicker.tsx`
- Modify: `frontend/src/pages/Cards.tsx` (entry points: Binder header button → TradeIn; profile row → ShowcasePicker)
- Design section: `<!-- Trade-in + showcase -->`
- Test: `frontend/src/components/cards/__tests__/TradeInSheet.test.tsx`

**Interfaces:**
- Consumes: `tradeInCards`, `setShowcase` (F1); user cards with `copies`.
- Produces: TradeInSheet — lists only cards with copies>1 (`×2 extra`, `+20 XP` per-rarity values: common 20 / uncommon 40 / rare 80 / legendary 200 / mythic 500), multi-select, total XP footer, confirm → api → success state with new XP; errors surfaced inline. ShowcasePicker — grid of owned cards, tap to pin, current pinned highlighted, clear option.

- [ ] Failing tests: only duplicates listed; total XP sums selected rarities correctly; API 400 shows error not success.
- [ ] RED → implement → GREEN; `tsc` clean; build.
- [ ] Commit: `feat: duplicate trade-in sheet and showcase picker`

---

### Task F14: PIN + settings fixes, session shell polish, loaders

**Files:**
- Create: `frontend/src/components/PinInput.tsx` (extracted shared component), `frontend/src/components/BrandedLoader.tsx`
- Modify: `frontend/src/components/PinEntry.tsx`, `frontend/src/components/SettingsModal.tsx`, `frontend/src/components/UserPicker.tsx`, `frontend/src/pages/Session.tsx`, `frontend/src/components/SessionHeader.tsx`, mode components (dead `onEnd` prop removal), `frontend/src/components/ChatMessage.tsx` (dead `index` prop)
- Design section: `<!-- Branded loader -->`
- Test: `frontend/src/components/__tests__/PinInput.test.tsx`

**Interfaces:**
- Produces:
  - `PinInput` shared component with FOUR NAMED REFS (`ref0..ref3` — fixes Rules-of-Hooks violation, bug #1), used by both PinEntry and SettingsModal (dedup, bug #15).
  - PinEntry auto-submit effect with correct deps (useCallback'd submit, bug #3).
  - SettingsModal: replace `user.has_pin = X` mutation with context setter update (bug #2).
  - UserPicker: remove hardcoded fallback user list → "Server unreachable" state (bug #19).
  - Session.tsx: load error → error banner + retry instead of silent redirect home (bug #11); pass no dead `onEnd` props.
  - SessionHeader: replace `window.confirm` with a small inline confirm popover (bug #17-adjacent).
  - BrandedLoader (`Pripravujeme lekciu…` + sub-copy + pulse animation per design) used during session creation.

- [ ] Failing tests: PinInput advances focus across 4 inputs and fires onComplete; paste of 4 digits fills all.
- [ ] RED → implement all → GREEN; `tsc` clean; build; grep confirms no `dangerouslySetInnerHTML`, no `user.has_pin =` assignments, no `onEnd` props remain.
- [ ] Commit: `fix: pin input hooks violation, context mutation, session error handling, branded loader`

---

### Task F15: Light theme, final verification, cleanup

**Files:**
- Modify: `frontend/src/index.css` (light theme values from `<!-- Home light -->` section), settings toggle in `SettingsModal.tsx` (persist `localStorage` `theme`), `frontend/src/App.tsx` (apply `data-theme`)
- Design section: `<!-- Home light -->`

- [ ] Implement light theme custom-property overrides + toggle; default dark.
- [ ] Full verification: `npx tsc -b --noEmit` clean; `npx vitest run` all green; `npx vite build` succeeds; `npx vite preview` + backend live: click through Home → config sheet → vocab session → feedback; Cards → buy pack → open → trade-in; Stats tabs; Guides; PIN set/verify; light-theme toggle.
- [ ] Confirm card art renders for sourced sets and monogram fallback shows for skipped cards.
- [ ] Commit: `feat: light theme and final polish`

---

## Self-Review Notes

- Spec coverage: every design section mapped (2a Home ✓F3, config sheet ✓F4, vocab quiz ✓F5, feedback ✓F7, stats hub ✓F8, guides ✓F9, card frames incl. mythic/full-art styling ✓F10, shop/binder ✓F11, pack opening ✓F12, trade-in/showcase ✓F13, loaders/skeletons ✓F3/F11/F14, light theme ✓F15). 2b Journey deliberately out (deferred per spec).
- All 23 assessment bugs assigned: #1,#3,#15→F14; #2→F14; #4,#5→F6; #6,#10→F8; #7,#8→F5; #9,#12,#13→F11/F10; #11,#16,#17→F14; #14→F1; #19,#20,#21→F3/F14; #22→F8; #18 (`CardBack size` prop) resolved by F10's rewrite; #23 (zero tests) addressed via vitest throughout.
- Visual tasks intentionally reference the design file rather than embedding JSX — the design HTML is the canonical spec and richer than any transcription; logic/bug-fix steps carry concrete code expectations and tests.
