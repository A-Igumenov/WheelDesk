# Documentation images

**English** · [Lietuvių](README.lt.md) · [← Back to the main README](../../README.md)

All pictures used by [`README.md`](../../README.md) and [`README.lt.md`](../../README.lt.md). They are real
screenshots of WheelDesk, taken from the browser preview of the interface with its built-in demo data
(demo library, radio catalogue, notes, calendars and photos), so no personal files appear in them.

| | |
|---|---|
| Format | PNG, 2× pixel density (664 × 504 px for a screen, 760 × 1224 px for the whole device) |
| Interface language | English (the menus are shown in English in both READMEs) |
| Licence | Same as the project: [MIT](../../LICENSE) |

## Images and where they are used

| Image | Shows | Used in (README section) |
|---|---|---|
| [`device-main-menu.png`](device-main-menu.png) | Whole device on a transparent background: oblique 3-D body, screen with the main menu, wheel, side volume keys | Title (hero) |
| [`device-now-playing.png`](device-now-playing.png) | Whole device while a song plays | §10.1 Controls |
| [`main-menu.png`](main-menu.png) | Main menu with the cover pane | §10.2 |
| [`music-menu.png`](music-menu.png) | Music menu | §10.3 |
| [`cover-flow.png`](cover-flow.png) | Cover Flow | §10.3 |
| [`artists.png`](artists.png) | Artists list | §10.3 |
| [`album-songs.png`](album-songs.png) | Songs of an album | §10.3 |
| [`search.png`](search.png) | Search with the letter strip and results | §10.3 |
| [`playlists.png`](playlists.png) | Playlists menu | §10.3 |
| [`on-the-go.png`](on-the-go.png) | On-The-Go list with Save / Clear | §10.3 |
| [`now-playing.png`](now-playing.png) | Now Playing for a library song | §10.4 |
| [`radio-menu.png`](radio-menu.png) | World Radio: Countries / Genres | §10.5 |
| [`radio-countries.png`](radio-countries.png) | Countries with station counts | §10.5 |
| [`radio-country-genres.png`](radio-country-genres.png) | Genres inside one country | §10.5 |
| [`radio-genres.png`](radio-genres.png) | All genres with counts | §10.5 |
| [`radio-stations.png`](radio-stations.png) | Stations of a country | §10.5 |
| [`radio-now-playing.png`](radio-now-playing.png) | A station playing: LIVE badge, song marquee | §10.5 |
| [`photos-menu.png`](photos-menu.png) | Photos menu with albums | §10.6 |
| [`photos-grid.png`](photos-grid.png) | Photo grid (4 × 3) | §10.6 |
| [`photo-full.png`](photo-full.png) | One photo full screen | §10.6 |
| [`extras-menu.png`](extras-menu.png) | Extras menu | §10.7 |
| [`alarm-editor.png`](alarm-editor.png) | Alarm settings | §10.7 |
| [`alarm-ringing.png`](alarm-ringing.png) | Ringing alarm: Dismiss / Snooze | §10.7 |
| [`calendar-month.png`](calendar-month.png) | Calendar month view | §10.7 |
| [`calendar-day.png`](calendar-day.png) | Events of one day | §10.7 |
| [`calendar-event.png`](calendar-event.png) | Event details | §10.7 |
| [`clocks.png`](clocks.png) | Clocks list | §10.7 |
| [`clock-face.png`](clock-face.png) | Octagonal clock face | §10.7 |
| [`history.png`](history.png) | History with times | §10.7 |
| [`games.png`](games.png) | Games menu | §10.7 |
| [`game-bricks.png`](game-bricks.png) | Bricks game | §10.7 |
| [`game-music-quiz.png`](game-music-quiz.png) | Music Quiz round | §10.7 |
| [`notes.png`](notes.png) | Notes folder | §10.7 |
| [`note-reader.png`](note-reader.png) | Reading a note (Lithuanian and Cyrillic text) | §10.7 |
| [`screen-lock-menu.png`](screen-lock-menu.png) | Screen Lock menu | §10.7 |
| [`screen-lock-combination.png`](screen-lock-combination.png) | Entering a combination | §10.7 |
| [`stopwatch.png`](stopwatch.png) | Stopwatch with laps | §10.7 |
| [`settings-1.png`](settings-1.png) | Settings, first page | §10.8 |
| [`settings-2.png`](settings-2.png) | Settings, middle | §10.8 |
| [`settings-3.png`](settings-3.png) | Settings, end | §10.8 |
| [`eq-presets.png`](eq-presets.png) | EQ presets | §10.8 |
| [`eq-editor.png`](eq-editor.png) | Custom EQ editor (10 bands) | §10.8 |
| [`volume-limit.png`](volume-limit.png) | Volume Limit | §10.8 |
| [`main-menu-editor.png`](main-menu-editor.png) | Main Menu editor (On/Off) | §10.8 |
| [`date-time.png`](date-time.png) | Date & Time | §10.8 |
| [`library-source.png`](library-source.png) | Library Source: drives with sizes | §10.8 |
| [`library-folder.png`](library-folder.png) | Folder browser: Use This Folder | §10.8 |
| [`about.png`](about.png) | About: songs, albums, source, version | §10.8 |
| [`legal.png`](legal.png) | Legal: author, licence, components | §10.8 |

## Regenerating the images

The images are produced by [`scripts/capture-doc-images.py`](../../scripts/capture-doc-images.py):

```bash
npm run build
npx vite preview --port 4173 --strictPort &
pip install playwright pillow
python -m playwright install chromium
python3 scripts/capture-doc-images.py          # writes into docs/images
```

Notes:

- The script drives the interface with the keyboard exactly as a user would (arrows, Enter, Esc).
- Clocks, calendar and history depend on the current date and time, so they differ between runs.
- `alarm-ringing.png` is taken by hand: create an alarm for the next minute and wait for it.
- After changing a menu, re-run the script and check the pictures before committing.
- Keep file names stable: both READMEs refer to them.

## Conventions

- Screen images are cropped to the 320 × 240 screen with its bezel; whole-device images keep the transparent background.
- Name files after the screen (`radio-countries.png`), lower case with hyphens.
- Add every new image to the table above in **both** language versions of this file.
