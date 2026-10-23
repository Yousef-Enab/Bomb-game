# CHANGES — Pixel-art arena, multi-answer questions, archer attack

## 1. Files
**Created** — `public/game.js` (client app), `public/config.js` (central asset manifest + timings), `public/layout.js` (pure circle layout), `public/sprites.js` (generated sheet metadata), `public/sheet_player.png`, `public/sheet_archer.png` (pixel-exact frame strips built from your GIFs), `public/heart.png`, `public/bomb.png`, `public/arrow.png` (**generated placeholders**), `public/Desert_day.png`, `public/Desert_night.png`, `public/Desert_sound.mp3` (your files, unchanged), `tools/make_sprites.py`, `tools/source/*.gif` (your originals), `tools/e2e_harness.mjs`, `tools/e2e_browser.py`, `test/layout.test.js`, `test/assets.test.js`, `CHANGES.md`.
**Modified** — `engine.js` (rules), `server.js` (static files + Range, attack phase, shared config), `questions.js` (format docs + `M()` helper only; **no question added or changed**), `public/index.html` (pixel UI shell; its inline script moved to `game.js`), `test/engine.test.js`, `test/server.test.js`, `package.json` (scripts), `README.md`.
**Removed** — nothing. The architecture is unchanged (zero-dependency Node + SSE, same deploy command).

## 2. Question format (edit `questions.js`, no engine change)
```js
// One answer (existing questions keep working as-is):
Q('Category', 1, 'Question text', 'answer', ['accepted alternative'], 'optional explanation')

// Several different answers; each item is one answer, or an array of spellings (first = shown):
M('Category', 2, 'Question text', ['answer 1', ['answer 2', 'other spelling'], 'answer 3'], 3, 'optional explanation')
//                                                                                          ^ need (optional): how many different answers complete it (default: all)
```
Duplicates are ignored even with different case, extra spaces, diacritics, hamza forms, ة/ه, ى/ي or Arabic-Indic digits. The question advances automatically when `need` different answers are found; the "found" answers are shown to everyone, the missing ones never are.

## 3. Assets
| Purpose | File | Status |
|---|---|---|
| Players (8 directions, 64×64, 4 frames) | `sheet_player.png` | built from your `Idle_breathing-idle_*.gif` |
| Archer (reload 9f / idle 4f / shoot 9f, 80×80 cells) | `sheet_archer.png` | built from your 3 archer GIFs (76×76 frames centred, no scaling) |
| Day / night backgrounds | `Desert_day.png`, `Desert_night.png` | yours |
| Ambience | `Desert_sound.mp3` | yours (85 s, looped) |
| Hearts (2 frames 9×9: full, empty) | `heart.png` | **generated placeholder** (not supplied) |
| Bomb (3 frames 16×16) | `bomb.png` | **generated placeholder** |
| Arrow (16×7, points right) | `arrow.png` | **generated placeholder** |

Replace a placeholder by dropping a file with the same name and the same frame layout (or edit its entry in `tools/make_sprites.py` and run `npm run sprites`). Filenames/paths: `public/config.js`; frame sizes and per-frame durations (taken from the GIFs): `public/sprites.js`.
Notes: (a) your *idle* GIF shows the bow already drawn (it reads as aiming), so it is used exactly as supplied for the hold phase of the attack, while the archer's resting pose at the centre is frame 0 of the reload GIF (standing, bow lowered) — switch with `REST` in `config.js`. (b) Original frame timing is 200 ms/frame, so a full attack is ≈ 5–7 s; set `ATTACK.speed` (e.g. 1.5) in `config.js` to shorten it.

## 4. Day/night and desert audio
Theme is a client-side preference (localStorage), two stacked background layers cross-faded by CSS opacity (0.7 s); nothing is re-created, so timer/question/turn are untouched. Audio: one `AudioContext`, one looping `AudioBufferSourceNode` (gapless), decoded silently while in the lobby, **started only when the match starts**, stopped on game over / leaving. Mute only lowers gain (no restart, no duplicates); volume = `AUDIO.volume`. If the browser blocks autoplay, a "tap to enable sound" button appears and the first touch/keypress starts it.

## 5. Multiplayer and progression logic
Server state per room: question id + `qv` (version), required/completed answer sets, active player, `turn.id`, hearts, eliminated/left flags, current attack. Every answer carries `turnId` and `qv`; anything stale is rejected, and the engine is single-threaded so one event is applied once.
- Wrong answer: message, retry, nothing changes. Duplicate: same. Correct but unfinished: bomb passes, timer resets, same question. Completed: next question (`qv`+1, completed set cleared).
- Timer reaches 0 → the room enters an **attack phase** (answers closed, `turn.atk` sent with remaining time). At its end the server applies exactly one heart of damage (idempotent), then passes the bomb. The client only animates this timeline from server-supplied remaining time, so refresh/reconnect never restarts or duplicates it.
- **Small-room rule (< 4 active players)** — explicit and separate from answer completion: if the bomb is about to return to a player who already lost a heart on the *current unfinished* question, the question advances once (missing answers are revealed, never counted as correct). If the others complete it first, it advances normally and nothing more happens when the bomb returns. Rooms of 4+ keep the question until completed.
- Behaviour changes to be aware of: a single-answer question now advances on the first correct answer; the old "two different players fail → new question" rule is replaced by the rules above.

## 6. Tests actually run (this environment)
- `node --test`: engine rules (multi-answer, duplicates, retry, `need`, double-submit, stale turn/version, attack timing, one-heart-only, small/normal rooms, elimination, leave-during-attack, no answer leaks, Arabic normalisation), circle layout, asset paths vs PNG sizes, and **real multi-client integration over HTTP+SSE** (3 clients, host-only settings, state parity, reconnect, elimination/restart/late-join, static files, Range for audio, path traversal).
- `tools/e2e_browser.py`: headless Chromium, 3 sessions (2 phone-size, 1 desktop) + a 6-player room: local player at bottom on every client, hearts per player, wrong/duplicate/alt-spelling answers, day→night mid-game without rebuild, audio not started before the game and started once, mute/theme without duplicate audio, attack phases and arrow, one heart lost identically everywhere, page reload/reconnect, no console errors.
- **Not tested**: real phones, Safari/iOS audio unlock, Firefox, actual audible playback, deployment to Render, more than 6 players in a browser (20 players on a small phone may overlap slightly).
