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
Space = play/pause · ← / → = seek 5s · Shift+← / → = previous / next · Ctrl/Cmd+F = search ·
Ctrl/Cmd+, = customize · click a lyric line to jump to it · scroll the lyrics to look ahead

## Notes
- Liquid glass refraction works in Chrome and Edge. Other browsers automatically use the Frosted style.
- Lyrics come from lrclib.net, a free community database. A few songs may be missing.
- Since February 2026 Spotify limits developer apps to 10 search results per request, so Lumen
  loads more with "Show more songs".
