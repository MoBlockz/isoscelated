# Isoscelated

A retro pixel-art social-deduction game for **4 to 20 players**, played in the browser.

You are living geometric shapes trapped in a giant floating **Toy Workshop**. Finish your chores to power the escape blimp. But hidden among you are the **HEXAGONERS**, who secretly zap players and turn them into **chess pieces**. A fresh victim becomes a **pawn**; about 30 seconds later it turns into a random other piece (knight, bishop, rook, queen or king). The piece keeps the player's colour, pattern, eyes, hat, hair and extras, so you can tell who it was. Work out who they are and vote them out of the blimp cannon before it's too late!

- Works on **iPad, phones** (touch D-pad and big buttons) and **desktop** (keyboard and mouse).
- **No accounts, no logins, no paid server.** It's just static files, so it runs on GitHub Pages for free.
- **Private lobbies only.** You can only play with people who have your 5-letter code. There is no public matchmaking and no strangers.
- **All music and sound is original** and made live in code with the Web Audio API.

---

## Put it online with GitHub Pages (free)

1. Sign in to [github.com](https://github.com) and create a **new repository** called `isoscelated`. It must be **Public**, because free GitHub Pages needs a public repo.
2. Upload every file and folder from this project into the repository, keeping the same folder layout: `index.html`, `README.md`, `manifest.json`, and the `js/`, `assets/`, `music/` and `tools/` folders.
   - Easiest way: open the new repo, click **"uploading an existing file"**, drag all the files and folders in, then click **Commit changes**.
   - Or, with git:
     ```
     git init
     git add .
     git commit -m "Isoscelated"
     git branch -M main
     git remote add origin https://github.com/YOUR-NAME/isoscelated.git
     git push -u origin main
     ```
3. In the repository go to **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose the **main** branch and the **/ (root)** folder, then click **Save**.
5. Wait about 1 minute and refresh the page. GitHub shows your link, which looks like:
   **`https://YOUR-NAME.github.io/isoscelated/`**
6. Open that link on every device that wants to play. On an iPad you can tap **Share → Add to Home Screen** so it opens like an app.

Every time you push or upload changes, GitHub Pages updates the game automatically within about a minute.

---

## How to play together

1. Everyone opens the game link and taps **CUSTOMIZE** to make their shape.
2. One person taps **CREATE LOBBY** and becomes the **host**. A 5-letter code appears in big letters, for example `TRIAG`.
3. Everyone else taps **JOIN LOBBY** and types that code.
4. In the lobby you can walk around, chat, press **READY**, and play tunes on the **Music Box** jukebox (walk up to it and press E or USE). The **mirror** lets you change your look.
5. The host sets the rules in **SETTINGS** and presses **START** once there are at least 4 players.
6. After the match, everyone goes back to the **same lobby with the same code** for another round.

> The host's browser runs the whole game, so the host should keep the game open and on screen. If the host leaves, everyone goes back to the main menu.

Playing alone? Try **PRACTICE**. You can walk the whole map, try every chore and test every Hexagoner power on dummy shapes. Open **MENU** to switch roles.

### Controls

| Action | Keyboard | Touch |
|---|---|---|
| Move | WASD / arrow keys | D-pad (bottom left) |
| Use / do chore | E | USE |
| Hex (Hexagoners) | Q | HEX |
| Special power (Shift / Plant / Rattle) | F | SHFT / PLNT / RTL |
| Report an object | R | RPT |
| Sabotage (Hexagoners) | X | SAB |
| Map | M | MAP |
| Quick Chat wheel | C | QUICK |
| Chat | Enter or T | CHAT |
| Menu / settings | Esc | MENU |

---

## Custom music (optional)

All music is generated in code, so no audio files are needed. If you want to use your **own** music instead, put MP3 files with these exact names into the `music/` folder:

| File | Replaces |
|---|---|
| `music/jazz.mp3` | Smooth Jazz (menu, lobby, gameplay) |
| `music/treachery.mp3` | Treachery Jazz (meetings, Hexagoner theme) |
| `music/showdown.mp3` | Golden Showdown (meltdowns, final 3, Shapes' victory) |

You only need the ones you want to replace; any style without a file keeps its generated music. The files loop automatically. **Only add music you are allowed to use.**

Each player can choose their music (Auto / one style only / Off) and set the music and sound-effect volumes in **SETTINGS**. Those choices are saved on that device only.

---

## Chat safety

- Every chat message **and** every player name goes through the filter in `js/filter.js`. The filter blocks swear words, insults, bullying phrases, adult words, drug and alcohol words, links, emails, phone numbers, addresses, and questions asking for personal info.
- It also catches tricks like `b.a.d`, `b a d`, `b@d`, `baaaad`, and words hidden inside longer words. Innocent words like *class*, *grass*, *Scunthorpe* and *assassin* still work.
- The **host's** game runs the filter, so a player can't get around it by changing their own copy of the game. Each player's device also checks first, so they see the "Oops!" message straight away.
- 3 blocked messages = muted for 60 seconds. 6 = muted for the rest of the match (Quick Chat still works). The host gets a notice.
- During normal gameplay Shapes can only use **Quick Chat**. Typed chat is open in the lobby, during meetings, for Spirits (only other Spirits can see it) and for the Hexagoner team (only they can see it).
- Tap any player's portrait to **mute** them (just for you) or **report** them. A report shows the host that player's last 5 messages. The host can kick players, and kicked players can't rejoin with that code. **NEW CODE** makes a fresh code.
- The host can set **Chat mode** to Full Chat, Quick Chat Only or Off.

### Adding more blocked words

Open `js/filter.js`. At the top are three easy-to-edit lists:

- `BLOCKED_WORDS`: single words to block. Add a new word in quotes followed by a comma, for example `'meanword',`.
- `BLOCKED_WHOLE_WORDS`: short words that should only be blocked on their own, because they also hide inside innocent words (like "ass" inside "class").
- `BLOCKED_PHRASES`: whole phrases to block, for example `'go away loser',`.
- `ALLOWED_WORDS`: innocent words that should never be blocked even though they contain a blocked word, for example `'scunthorpe',`.

Write words in lower case without tricks; the filter handles the `@`/`4`/`$`/spaces/dots versions itself. To check your changes, run `node tools/filter-test.js` if you have Node.js installed.

---

## How it works (for the curious)

- Plain HTML, CSS and JavaScript with the HTML5 Canvas 2D API. There is no build step.
- The game is drawn on a small pixel canvas and scaled up by a whole number with smoothing turned **off**, so pixels stay perfectly crisp.
- Multiplayer first tries a **direct** connection with **PeerJS** (WebRTC), with the lobby code as the room ID. If that can't connect (different houses, phones on 4G/5G, strict routers), the game automatically switches to the **relay**: messages travel through free public MQTT servers (test.mosquitto.org, with broker.emqx.io as backup) over secure WebSockets. Relayed messages are end-to-end encrypted (ECDH + AES-GCM) with a key only the host and that player share, so nobody can peek. The lobby shows "CONNECTED DIRECTLY" or "CONNECTED VIA RELAY".
- The host's browser is the game server. It decides roles, positions, hexes, marks, votes and timers, and sends each player about 15 updates per second. Each player only receives what they're allowed to know: nobody else's role, Hexagoner type or Planter marks, and no players outside their vision circle.
- Your name, look, music choice and volumes are saved in your browser (`localStorage`).
- Both PeerJS and the relay servers are free public services. If a school or office network blocks them, play from a home network or phone data instead.

| File | What's inside |
|---|---|
| `index.html` | The page |
| `js/filter.js` | Chat and name safety filter (word lists at the top) |
| `js/audio.js` | All music and sound effects (Web Audio) |
| `js/gfx.js` | Pixel font, palette, character, object and effect art |
| `js/world.js` | The Toy Workshop map, rooms, props, collisions |
| `js/net.js` | Lobby codes; tries a direct connection, then the relay |
| `js/relay.js` | Encrypted fallback relay over public MQTT WebSockets |
| `js/server.js` | The host's game rules, chat filtering and secret-safe updates |
| `js/ui.js` | Input, buttons, menus, text boxes |
| `js/tasks.js` | The 13 chore mini-games |
| `js/client.js` | Each player's view: world, HUD, meetings, overlays |
| `js/main.js` | Main menu, customize, join, how to play, settings, main loop |
| `tools/` | Developer helpers (local test server, filter tests); not needed to play |

### Testing on your own computer

Browsers won't run the multiplayer part from a `file://` address, so start a tiny local server in the project folder:

```
node tools/serve.js
```

Then open `http://localhost:8792` in several browser tabs and create or join a lobby to play against yourself. Adding `?bots=5` to the host's address adds 5 practice bots to the lobby.
