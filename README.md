# Lumen: your own Spotify player

Liquid-glass design, Apple Music-style synced lyrics, and a fully customizable UI.
Lumen doesn't modify the Spotify app, so Spotify updates can't break it.

## First-time setup (about 5 minutes)

1. **Install Node.js** (the LTS button) from https://nodejs.org. If Windows still says it's
   missing afterwards, restart your PC once.
2. **Start Lumen**
   - **Windows:** double-click `start-windows.bat`
   - **Mac:** double-click `start-mac.command` (first time: right-click → Open)
   - Lumen opens in Chrome or Edge.
3. **Install it as an app:** click **Install** in the bubble at the bottom-left
   (or ⚙ Customize → "Install Lumen as an app").
   From then on, open **Lumen from your Start menu / taskbar / Dock / Launchpad** like any app.
   You won't need the start file or Node.js running anymore. It even opens offline.
4. **Connect Spotify:** the welcome screen walks you through it
   (create a free app at developer.spotify.com, paste the Client ID).
   You need Spotify Premium to play music. Spotify requires it for all developer apps.

## Android app
Install **`android/releases/lumen-1.0.0.apk`** on your phone or tablet (allow "install unknown apps" for your browser
or file manager when asked).

1. In the Spotify Developer Dashboard, open your Lumen app → **Edit settings** → add the Redirect URI
   **`lumen://callback`** (keep the `http://127.0.0.1:8888/callback` one for your computer) → Save.
2. Open Lumen, paste your Client ID, and log in. Spotify's login opens in a secure Chrome tab, so Google sign-in works.

On Android, Lumen shows and controls what the **Spotify app** plays. Spotify doesn't allow its web player on phones,
so Lumen can't play the audio itself there. Everything else works: lyrics, pages, queue, devices, playlist editing,
themes. On phones, tap the 💬 button in Now Playing for full-screen lyrics. The back button closes panels, then goes back.

**Updates:** Lumen inside the app updates itself over the air from this repo (same fingerprint checks and automatic
rollback as on the computer). The rare update to the app itself shows an **Install** button in Lumen.

Building the APK yourself: `android/build.sh` (needs the Android SDK, JDK 17+, and the signing key in
`android/keystore.properties`, which is never committed).

## Updates (automatic)
Lumen updates itself over the air. When it opens (and every few hours) it checks
github.com/leoble123/lumen for a new version, downloads it in the background, and shows a
**Restart** bubble. You can also use ⚙ Customize → **Check for updates**, or turn off
**Automatic updates** there.

- Only changed files are downloaded.
- Every file is checked against the SHA-256 fingerprint in `version.json`, so a corrupted
  or tampered download is thrown away.
- If a new version ever fails to start, Lumen goes back to the last working version and
  skips the broken one.

### Publishing an update (for developers)
```bash
node tools/release.js 0.4.1 "What's new in this version"
git commit -am "Lumen 0.4.1" && git push
```

## Home
Lumen opens on **Home** (change it in Customize → General): your quick picks, the albums and playlists you were just
playing, recently played songs, your top artists, what's on repeat, your saved albums and your playlists.

## Make it yours (⚙ Customize)
- **Themes:** one-tap presets (Midnight, Sunset, Vapor, Mono, Crystal, Lava, Spotlight). Save your own look, share it
  as a code, or import a friend's.
- **Backgrounds:** GPU-rendered Mesh gradient, Aurora, Lava lamp, Waves, Starfield, plus Fluid, Album art and Solid,
  with motion, intensity and film-grain sliders. They all take their colors from the album art.
- **Layout:** Classic, Big art, Lyrics only (zen) or Compact; album art as Rounded, Square, Circle, a spinning
  **Vinyl** record or a **CD**; tab bar at the bottom, top or side (or hidden until you point at it); show or hide
  volume, song times, "Playing on" and the top buttons.
- **Appearance:** Dark, OLED black, or Light.
- **Glass:** Liquid / Frosted / Tinted, plus refraction, thickness, color fringe, edge shine, tint color and corner roundness.
- **Your own wallpaper:** any image or looping video (kept on your computer), with dim and blur.
- **Particles:** dust, bokeh, snow or fireflies in your album colors.
- **Album colors:** Vibrant, Muted, Dark or Light palettes picked from the cover (via node-vibrant), or your own color.
- **Fonts:** 36 Google Fonts, chosen separately for lyrics and for the app.
- **Custom CSS** (Advanced): restyle anything with your own CSS, Spicetify-style, with live preview.
- **Lyrics styles:** Word by word (each word lights up and lifts as it's sung), Line sweep, Minimal and One line,
  with size, glow, letter spacing and line spacing controls.

## Command palette — Ctrl+K (⌘K on Mac)
Type to do almost anything: change a setting ("aurora"), apply a theme ("theme sunset"), jump to a page, control
playback, or search Spotify and play or open the result.

## Media keys
Your keyboard's play/pause/next/previous keys control Lumen, and Lumen shows up in the Windows media pop-up and the
Mac's Now Playing menu with the album art.

## Getting around
- **Playlists, albums, artists:** tap any cover or name to open its page. The round ▶ on a cover plays it right away.
  Artist and album names are tappable everywhere, including in the player and mini player. The cover art opens the album.
- **Song options:** hover a song and press **•••** (or right-click) to add it to the queue, add it to a playlist, like it,
  or go to its album or artist.
- **Queue** (top-right list icon): see what's playing next and remove songs. Spotify doesn't let apps delete
  queue items, so Lumen skips removed songs automatically while it's open.
- **Devices** (top-right, or "Playing on …" in the player): move playback to your phone, a speaker or TV, change
  a device's volume, or bring the music back to Lumen. To pick your computer's speakers or headphones, use your
  computer's sound settings.
- **Your playlists:** create one with **New playlist** in Library. On a playlist you own, ✏️ renames or deletes it,
  drag songs to reorder them, and use ••• → Remove to take songs out.
- **Liked songs:** the ♡ in the player, or ••• → Save to Liked Songs.

Spotify limits what personal apps can see: songs inside playlists you **don't own** can't be listed
(you can still play them), and there's no "top songs" list for artists, so Lumen shows popular songs from search.

## Playback (⚙ Customize → Play audio in)
- **Lumen:** Lumen plays the music itself.
- **Spotify app:** the normal Spotify app (or your phone) plays the music, and Lumen shows lyrics + controls.
  Lumen switches to this automatically if in-app playback ever fails.

## Shortcuts
Ctrl/Cmd+K = command palette · Space = play/pause · ← / → = seek 5s · Shift+← / → = previous / next · Ctrl/Cmd+F = search ·
Ctrl/Cmd+, = customize · click a lyric line to jump to it · scroll the lyrics to look ahead

## Notes
- Liquid glass refraction works in Chrome and Edge. Other browsers automatically use the Frosted style.
- Lyrics come from lrclib.net, a free community database. A few songs may be missing.
- Since February 2026 Spotify limits developer apps to 10 search results per request, so Lumen
  loads more with "Show more songs".

## Credits
Bundled open-source libraries (MIT, see `public/vendor/LICENSES.txt`): node-vibrant (album palettes) and CodeMirror 5
(CSS editor). Ideas borrowed from great open-source projects (no code copied): Apple Music-like Lyrics (AMLL) and Beautiful Lyrics
for word-by-word lyrics, whatamesh for mesh gradients, and cmdk / ninja-keys for the command palette.
Lyrics: [LRCLIB](https://lrclib.net).
