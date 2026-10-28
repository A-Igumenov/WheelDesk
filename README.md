# WheelDesk

**English** · [Lietuvių](README.lt.md)

A retro click-wheel music player for **Windows, Linux and macOS**. WheelDesk behaves like the classic
pocket music players of the 2000s — one wheel, a centre button, nested menus, *Now Playing* — but it
looks deliberately different: an angular, octagonal design of its own, drawn as a small device on your
desktop.

<p align="center"><img src="docs/images/device-main-menu.png" width="300" alt="WheelDesk main menu on the desktop"></p>

| | |
|---|---|
| **Version** | 1.4.0 |
| **Original idea and first author** | Aleksandr Igumenov |
| **Licence** | [MIT](LICENSE) — free to use, study, modify and share; keep the copyright notice |
| **Stack** | Tauri 2 · React 18 · TypeScript · Canvas 2D · Rust (rodio, Symphonia, lofty) |
| **Platforms** | Windows 10/11 x64, Linux x64 (deb, rpm, AppImage), macOS 11+ (Apple Silicon and Intel) |

---

## Contents

1. [Overview](#1-overview)
2. [Quick start](#2-quick-start)
3. [From idea to product](#3-from-idea-to-product)
4. [Alternatives considered](#4-alternatives-considered)
5. [Requirements](#5-requirements)
6. [Architecture](#6-architecture)
7. [Key algorithms](#7-key-algorithms)
8. [Build and release](#8-build-and-release)
9. [Testing](#9-testing)
10. [User manual](#10-user-manual)
11. [Privacy and network use](#11-privacy-and-network-use)
12. [Limitations and roadmap](#12-limitations-and-roadmap)
13. [Contributing](#13-contributing)
14. [Licence and attribution](#14-licence-and-attribution)

All screenshots live in [`docs/images`](docs/images/README.md), which also explains where each one is
used and how to regenerate it.

---

## 1. Overview

WheelDesk is a desktop music player whose **behaviour** follows a classic click-wheel player:

- the whole device — chassis, screen, wheel and side volume keys — is drawn on one canvas and works
  the same on every operating system;
- every function is reached through the wheel menus; mouse clicks on menu rows are optional;
- music never stops or stutters while you browse, scan or change settings.

What it does:

| Area | Highlights |
|---|---|
| **Music library** | Any drive and folder; MP3, M4A/AAC, FLAC, OGG, AIFF; repairs old Windows code pages in tags; infers artist from file names; albums by folder |
| **Browsing** | Cover Flow, Playlists, Artists, Albums, Compilations, Songs, Genres, Composers, Audiobooks, Search |
| **Playlists** | On-The-Go (hold the centre button), saved lists, import of M3U/M3U8/PLS/XSPF/WPL from the PC |
| **Sound** | Real 10-band EQ with 22 presets and a custom curve, Sound Check (ReplayGain or measured), Audio Crossfade, Volume Limit |
| **World radio** | ~33,700 broadcasters filtered by **country** and **genre**; ICY song titles as a marquee; song covers |
| **Covers** | Embedded → folder image → open sources only (MusicBrainz / Cover Art Archive, TheAudioDB, Wikipedia) |
| **Extras** | Photos with slideshow, Notes (.txt/.md), Calendars (.ics), Clocks, Alarms, Stopwatch, History, Screen Lock, two games |
| **Desktop** | Hides to the tray next to the clock, resumes exactly where you stopped, three languages (EN/LT/RU) |

---

## 2. Quick start

Download the package for your system and install it:

| System | Package | Notes |
|---|---|---|
| Windows 10/11 | `WheelDesk_<ver>_x64-setup.exe` or `…_x64-portable.zip` | WebView2 is part of Windows 10/11 |
| Linux (Debian/Ubuntu) | `WheelDesk_<ver>_amd64.deb` | Pulls in WebKitGTK and AppIndicator |
| Linux (any) | `WheelDesk_<ver>_amd64.AppImage` | `chmod +x` and run |
| Linux (Fedora/openSUSE) | `WheelDesk-<ver>-1.x86_64.rpm` | |
| macOS | `.dmg` built with `scripts/build-macos.sh` | Ad-hoc signed; first start: right-click → Open |

First steps: **Settings → Library Source → drive → folder → Use This Folder**, then **Music**.

---

## 3. From idea to product

### 3.1 The idea

> *A PC music player that feels exactly like a classic click-wheel player: the same menus, the same
> wheel, the same logic — but in its own angular look, so no design is copied.*

The idea came with a short list of wishes that shaped the whole project:

1. Behaviour as close to the original as possible; all menus driven by an on-screen wheel.
2. A non-infringing style: angular, no original names, logos, icons or fonts.
3. All modern music formats except WAV; album covers fetched from public sources.
4. The user's own drives as the music source; the last drive is remembered (even if its letter changes).
5. Playlist files from the PC can be imported.
6. A real, editable EQ with presets.
7. Identical on Windows, Linux and macOS.

Later iterations added internet radio (first fm.lt, later a world catalogue), side volume keys,
Russian and Lithuanian, mouse control, tray mode, resume after restart, a 3-D look and the full
*Extras* and *Settings* menus.

### 3.2 Goals and non-goals

| Goals | Non-goals |
|---|---|
| Faithful *interaction*: wheel, centre, MENU, ⏮ ⏭ ⏯, hold for On-The-Go | Pixel copy of any real device, its fonts or icons |
| One code base, same behaviour on three OSes | Platform-specific UI toolkits |
| Works fully offline with local music | Streaming-service accounts, DRM, cloud sync |
| Open data only (covers, radio) | Store or paid catalogues (iTunes, Deezer, Spotify …) |
| Small, readable code that students can study | A plug-in system or skins |

### 3.3 Design principles

- **Behaviour first.** Each menu was reverse-engineered by observing what the original does, then
  rebuilt as our own version. Unfinished items were shown grey until implemented (two per iteration).
- **Never interrupt the music.** Audio runs on its own thread; decoding of live streams runs on yet
  another thread with a ring buffer, so a slow network can never block files or the UI.
- **Pure logic, thin shell.** Menu logic (`src/core`) has no DOM and no Tauri; OS-specific code lives in
  the Rust core (`crates/core`); the Tauri layer only exposes commands.
- **Offline first, open data.** The radio catalogue is built into the app; covers come only from open,
  free sources and are cached.
- **Remember everything.** Settings, library index, last drive, queue position and the last station
  survive restarts.

### 3.4 Development process

The project was built in short cycles, each ending with compiled packages for Windows and Linux:

```text
idea ─► plan ─► skeleton (wheel + menus on canvas) ─► library + playback ─► covers
     ─► radio ─► Extras / Settings, 2 items per cycle (grey until done) ─► full menu (v1.0)
     ─► tray, 3-D look, resume (v1.1–1.2) ─► world radio + open covers (v1.3–1.4)
```

Every cycle: implement → unit tests → screenshots of the real UI in the browser preview → build
Windows (cross-compiled from Linux) and Linux packages → smoke run under a virtual display.

---

## 4. Alternatives considered

Each decision below is written as a short decision record: the options, the choice, and why.

| # | Decision | Options considered | Chosen | Why |
|---|---|---|---|---|
| D1 | Desktop framework | Electron · **Tauri 2** · Qt/QML · Flutter · native per OS | **Tauri 2** | Small installers (~5–10 MB vs ~80 MB), Rust for audio and files, same web UI on all OSes; same stack as the author's MiotDesk/AqDesk |
| D2 | Drawing the device | DOM/CSS · SVG · **Canvas 2D** · WebGL | **Canvas 2D** | Pixel-identical on WebView2, WebKit and WebKitGTK; exact hit-testing of the wheel; cheap animations. Cost: accessibility and text layout are done by hand |
| D3 | UI logic | React state everywhere · **plain TypeScript state machine** + thin React shell | **State machine** (`Navigator`) | Testable without a browser; screens are data (`Screen` objects) |
| D4 | Audio engine | HTML `<audio>`/WebAudio · GStreamer · VLC · **rodio + cpal + Symphonia** | **rodio/Symphonia** | Pure Rust, no system codecs needed, gapless, DSP in-process; WebView audio differs per OS and cannot be processed reliably |
| D5 | Tags | TagLib (C++) · **lofty** | **lofty** | Pure Rust, reads ID3, MP4, Vorbis, FLAC, AIFF |
| D6 | Settings and index storage | SQLite · **JSON files** | **JSON** | Human-readable, tiny, no migrations; the library index is a cache that can be rebuilt |
| D7 | Album covers | iTunes · Deezer · Last.fm · Discogs · **MusicBrainz/CAA + TheAudioDB + Wikipedia** | **Open sources only** | No paid or store APIs, no keys to protect; community data |
| D8 | Radio directory | Scraping fm.lt · live Radio Browser API · **bundled Radio Browser snapshot** ([radio-playlists](https://github.com/AlonDrilich/radio-playlists), CC0) | **Bundled** (since v1.3) | Works offline, instant filtering, no API load; refreshed by a script |
| D9 | Which stations | All 69,781 entries · **broadcasters only** | **Broadcasters** | Scoring of official signs + merging of duplicates (§7.6) |
| D10 | Drive identity | Drive letter / mount path · **volume GUID / filesystem UUID** | **Stable volume ID** | The last drive is found again after a letter or mount change |
| D11 | 3-D look | True isometric · **oblique (cabinet) projection** | **Oblique** | The front (screen, wheel) stays undistorted and clickable as before; only edges are added |
| D12 | Windows builds | Windows machine/CI only · **cross-compile from Linux** (MinGW + NSIS) | **Both** | Packages can be produced from one Linux box; CI covers native builds |
| D13 | Licence | GPL · Apache-2.0 · **MIT** | **MIT** | Shortest permissive licence, compatible with every dependency (§14) |

---

## 5. Requirements

### 5.1 Functional requirements

| ID | Requirement | Acceptance criterion |
|---|---|---|
| FR-01 | Wheel control of all menus | Rotating 15° moves one row; centre selects; top = MENU; left/right = ⏮ ⏭; bottom = ⏯ |
| FR-02 | Centre joystick | Up/down move, left = MENU, right = open, middle = play/pause; hold 0.7 s = add to On-The-Go |
| FR-03 | Library from any drive | Drive is identified by GUID/UUID; after a restart or letter change the same folder is found |
| FR-04 | Formats | MP3, M4A/AAC, FLAC, OGG, AIFF are scanned and play; WAV is skipped |
| FR-05 | Text repair | Tags in Windows-1251/1257 or double-encoded UTF-8 display correctly |
| FR-06 | Albums by folder | One album per folder; untagged songs join the folder's album; mixed tags → folder name |
| FR-07 | Browsing | Cover Flow, Artists, Albums, Compilations, Songs, Genres, Composers, Audiobooks, Search |
| FR-08 | Playlists | On-The-Go, save/clear, import M3U/M3U8/PLS/XSPF/WPL, missing files reported |
| FR-09 | Playback | Queue, ⏮ restarts after 3 s, hold ⏮ ⏭ seeks, Shuffle songs/albums, Repeat one/all |
| FR-10 | Non-blocking UI | Browsing, scanning and settings never stop or stutter the music |
| FR-11 | Covers | Embedded → folder → open sources; cached; misses retried after 7 days (songs: 1 day) |
| FR-12 | EQ | 10 bands ±12 dB, 22 presets + Custom, applied while playing to files and radio |
| FR-13 | Sound Check / Crossfade / Volume Limit | Level matching; 6 s equal-power crossfade; volume cap with optional 4-digit code |
| FR-14 | World radio | Filter by country and genre; ⏮ ⏭ stay in the filtered list; fallback to the station's other streams |
| FR-15 | Extras | Photos, Notes, Calendars, Clocks, Alarms, Stopwatch, History, Screen Lock, Games |
| FR-16 | Settings | Main Menu / Music Menu editing, Backlight, Clicker, Mouse Control, Date & Time, Language, Library Source, Legal, Reset |
| FR-17 | Tray | Minimize hides to the tray; tray click shows; Close quits completely |
| FR-18 | Resume | After restart the same queue/song/position (or station) continues |
| FR-19 | Languages | English, Lithuanian, Russian, including Cyrillic and Lithuanian letters in the bundled font |

### 5.2 Non-functional requirements

| ID | Requirement | How it is met |
|---|---|---|
| NFR-01 | Same look and behaviour on Windows, Linux, macOS | One canvas, bundled Inter font, logic in TS/Rust without OS branches |
| NFR-02 | Responsiveness | Audio thread + decode thread + ring buffer; scanning on a Rayon pool (cores − 1) |
| NFR-03 | Startup | Library shown immediately from the cached index; changed files rescanned in the background |
| NFR-04 | Robustness | Decoder panics are caught; unreadable files skipped; live streams reconnect up to 5 times |
| NFR-05 | Offline | Local music, radio catalogue, notes, calendars and photos work without internet |
| NFR-06 | Footprint | Installer ≈ 9–10 MB (Windows), radio catalogue 3 MB compressed |
| NFR-07 | Licensing | Only permissive or file-level copyleft dependencies; open data sources |
| NFR-08 | Testability | Menu logic, DSP, catalogue, parsers covered by automated tests (§9) |

### 5.3 Constraints

- Non-infringing visual style: no original names, logos, icons or typefaces.
- Window is frameless and transparent; the device draws its own window controls.
- The Rust core must not depend on Tauri (it is reused by examples and tests).

---

## 6. Architecture

### 6.1 Layers

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  WebView (WebView2 / WebKit / WebKitGTK)                                     │
│  ┌──────────────────────────┐   ┌──────────────────────────────────────────┐ │
│  │ src/render  (Canvas 2D)  │◄──│ src/core   (pure TypeScript, no DOM)     │ │
│  │ device · screen · views  │   │ Navigator · menus · Library · Playback   │ │
│  │ wheel hit-testing, input │──►│ search · eq · ics · alarms · games       │ │
│  └──────────────────────────┘   └───────────────────┬──────────────────────┘ │
│                 App.tsx (wiring, timers, resume)    │                        │
│                 src/platform/bridge.ts ─────────────┘  (invoke / listen,     │
│                                                         browser demo data)   │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ Tauri IPC: 25 commands, 3 events
┌───────────────────────────────▼──────────────────────────────────────────────┐
│  src-tauri  (thin shell: commands, window, tray, asset protocol)             │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ plain Rust calls
┌───────────────────────────────▼──────────────────────────────────────────────┐
│  crates/core  (wheeldesk-core, no Tauri)                                     │
│  volumes · settings · library · text · playlists · docs                      │
│  player ─► dsp ─► rodio/cpal ─► audio device                                 │
│  stream (ICY, playlists, HLS) · catalog · radio · covers · art               │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Module map

**Frontend (`src/`)**

| Module | Responsibility |
|---|---|
| `core/navigator.ts` | Menu state machine: stack of views, rotate/select/back/hold, custom screens, mouse rows |
| `core/menus.ts` | Every screen of the device, built from `MenuContext` (data + actions) |
| `core/library.ts` | Library indexes: artists, albums, compilations, genres, composers, sort keys |
| `core/playback.ts` | UI view of playback: queue, radio list and filter, resume, volume limit |
| `core/search.ts` · `eq.ts` · `ics.ts` · `alarms.ts` · `clocks.ts` · `stopwatch.ts` · `timefmt.ts` | Search folding, EQ curves, iCalendar parser, alarm timing, world clocks, timer, 12/24 h |
| `core/games/` | Bricks physics, Music Quiz rounds |
| `core/strings.ts` | All UI text in English, Lithuanian, Russian |
| `core/wheel.ts` | Wheel maths: angle → ticks (15° per row), acceleration on long lists |
| `render/device.ts` | Chassis (oblique projection), wheel, side keys, input, joystick, animation loop |
| `render/screen.ts` | Title bar, rows, scroll bar, slide transitions, title clock |
| `render/*.ts` | Now Playing, Cover Flow, search, EQ, picker, calendar, photos, games, text pages … |
| `platform/bridge.ts` | The only place that talks to Rust; in a plain browser it serves demo data |
| `App.tsx` | Wiring: settings, library loading, player events, history, alarms, resume, tray quit |

**Rust core (`crates/core/src/`)**

| Module | Responsibility |
|---|---|
| `volumes.rs` | Drive list with stable IDs (Windows GUID, Linux/macOS UUID, fallback `mnt:`) |
| `settings.rs` | `settings.json` in the OS config dir; unknown UI fields preserved |
| `library.rs` | Parallel scan, tag reading, file-name inference, folder albums, index cache |
| `text.rs` | Repair of legacy code pages (1251, 1257, mis-decoded UTF-8) |
| `playlists.rs` | M3U/PLS/XSPF/WPL parsing and path resolution |
| `player.rs` | Player thread, queue rules, streams, Sound Check, crossfade |
| `dsp.rs` | 10-band biquad EQ, level smoothing, loudness analysis |
| `stream.rs` | HTTP/ICY streams, playlists (.pls/.m3u/.xspf/.asx), HLS + MPEG-TS demux, live ring buffer |
| `catalog.rs` | Built-in world station catalogue, genre classification, filters |
| `covers.rs` · `art.rs` | Open cover sources; embedded/folder art; disk cache |
| `radio.rs` | Song-cover lookup for radio titles (and the legacy fm.lt list) |
| `docs.rs` | Text files (notes, calendars) in any encoding; folder listings; photo search |

### 6.3 Module interaction

```text
 pointer / keys                                                  OS audio device
      │                                                                ▲
      ▼                                                                │
┌───────────┐ rotate/select/back ┌───────────┐  actions   ┌──────────┐ │
│ device.ts │───────────────────►│ Navigator │───────────►│ menus.ts │ │
│ (input)   │◄──── redraw ───────│  (stack)  │◄─ Screen ──│ screens  │ │
└─────┬─────┘                    └───────────┘            └────┬─────┘ │
      │ draw(screen)                                          │ ctx.*  │
      ▼                                                       ▼        │
┌───────────┐                  ┌────────────┐  play/seek  ┌──────────┐ │
│ screen.ts │                  │ App.tsx    │◄────────────│ Playback │ │
│ views     │                  │ (wiring)   │────────────►│ Library  │ │
└───────────┘                  └─────┬──────┘   state     └────┬─────┘ │
                                     │ bridge.ts                │      │
                     invoke ─────────┼──────────── listen ──────┘      │
                                     ▼                                 │
                ┌──────────────── src-tauri ─────────────────┐         │
                │ commands: library · player · radio · files │         │
                └───┬─────────┬──────────┬──────────┬────────┘         │
                    ▼         ▼          ▼          ▼                  │
               library.rs  player.rs  catalog.rs  covers.rs            │
                    │         │  │         │          │                │
                    ▼         │  └► stream.rs ─► internet radio        │
               file system    └──► dsp.rs ─► rodio/cpal ───────────────┘
```

### 6.4 Sequence diagrams

**Start-up and resume**

```text
App            bridge/Tauri          core                    UI
 │ get_settings ─────►│ settings.json ──►│
 │◄──────── Settings ─┤                  │
 │ resolve_library_source(volumeId) ────►│ find drive by GUID/UUID
 │ library_cached(root) ────────────────►│ library-cache.json
 │ Library(cached) ──────────────────────────────────────────► main menu shown
 │ settings.resume? ── tracks: restore(queue,index,pos,playing) ─► Now Playing
 │                  └─ radio:  radio_catalog(filter) → playStation
 │ scan_library(root) ──────────────────►│ rayon scan, "scan-progress" events
 │◄──────────────────────── tracks ──────┤
 │ Library(fresh) ───────────────────────────────────────────► redraw
```

**Playing a song**

```text
menus      Playback        bridge      player thread          dsp/rodio
  │ open song ─►│ playerLoad(queue) ──►│ start(i): open_decoder
  │             │                      │ Sound Check gain (tag | measured)
  │             │                      │ Sink ◄─ Dsp(decoder, eq, level) ──► audio
  │             │◄── "player-state" ───┤ every 250 ms: pos, index, playing
  │◄─ redraw ───┤                      │ last 6 s & crossfade on → start next, fade both
```

**Radio station with fallback streams**

```text
menus          Playback               player thread             stream.rs
 │ station ──►│ playerLoad({path, alternates})
 │            │                       │ thread: for url in [path, alternates…]
 │            │                       │   open_live(url) ───────► HTTP GET (Icy-MetaData)
 │            │                       │                           .pls/.m3u/.xspf/.asx → follow
 │            │                       │                           HLS → segments, TS → ADTS
 │            │                       │◄── Ok(Live) / Err ────────┤ decode thread → ring buffer
 │            │                       │ first Ok wins; all Err → "Cannot connect"
 │◄── "player-state" (buffering → playing, streamTitle) ┤
```

**Cover lookup**

```text
ArtStore (UI) ── get_art(track) ──► art.rs
   1 embedded picture in the file ─────────────────────────────► found? done
   2 cover.jpg / folder.jpg / front.png … in the folder ─────────► found? done
   3 disk cache artwork/<hash>.img (hit) | .none (miss < 7 days) ─► done
   4 covers::album():
        MusicBrainz release-group search (1 req/s) → Cover Art Archive front-500
        TheAudioDB searchalbum.php → strAlbumThumb
        Wikipedia search → article image (must be about that album by that artist)
   5 store .img or .none
```

### 6.5 Navigator state machine

```text
             select (item.open)                 select (item.run + closeAfter)
   ┌────────┐ ───────────────► ┌──────────┐ ────────────────────────────► back one level
   │ Screen │                  │ Screen+1 │
   └────────┘ ◄─────────────── └──────────┘
             back (MENU)        │  ▲
                                │  │ custom screens: onRotate / onSelect / onButton /
                                ▼  │ onText / onClick / draw / upIsMore / transient
                         modal screens (lock, alarm) consume MENU and buttons
```

A `Screen` is plain data: `id`, `title`, `items()` (rebuilt on every read, so values stay current),
optional `draw()` for custom views and hooks for wheel, buttons, text and mouse. Pickers marked
`transient` close together with the screen that finishes them.

### 6.6 Audio pipeline

```text
 file ─► Symphonia decoder ─┐
                            ├─► Dsp ─────────────────────────► rodio Sink ─► mixer ─► cpal ─► device
 radio ─► stream.rs ─► Live │    ├ level (Sound Check / fades, smoothed ~50 ms)
          (decode thread,   │    ├ pre-gain (headroom for EQ boosts)
           ring buffer,     │    ├ 10 × peaking biquad per channel (32 Hz … 16 kHz)
           silence on       │    └ soft clip above 0.8
           underrun)  ──────┘
 Volume: perceptual curve v² on the Sink · Crossfade: two Sinks with equal-power levels
```

### 6.7 IPC contract (Tauri)

| Command | Purpose |
|---|---|
| `get_settings`, `save_settings` | Read/write `settings.json` |
| `list_volumes`, `resolve_library_source`, `list_dirs` | Drives and folders |
| `library_cached`, `scan_library` | Cached index; full scan (emits `scan-progress`) |
| `get_art`, `song_cover` | Album art (data URL); radio song cover URL |
| `player_load`, `player_cmd` | Queue; `toggle pause next prev stop seekTo seekBy volume repeat eq soundcheck crossfade` |
| `radio_countries`, `radio_genres`, `radio_catalog`, `radio_station` | World catalogue filters and lookup |
| `radio_stations`, `radio_resolve` | Legacy fm.lt list (kept for compatibility) |
| `list_playlist_dir`, `read_playlist` | Playlist import |
| `list_files`, `find_files`, `read_text` | Notes, calendars, photos |
| `hide_to_tray`, `show_window`, `quit_app` | Window and tray |

| Event | Payload |
|---|---|
| `player-state` | `playing, index, queueLen, positionMs, durationMs, volume, path, error, buffering, streamTitle` |
| `scan-progress` | `root, done, total` |
| `app-quit` | Tray *Quit*: the UI saves its place, then the app exits (1.5 s timeout) |

### 6.8 Data model (main types)

```text
Settings ─ language, shuffle, repeat, eqPreset, eqCustom[10], soundCheck, crossfade,
           volume, volumeLimit, volumeLimitCode, backlightSecs, clicker, mouseControl,
           mainMenu[], musicMenuHidden[], librarySource{volumeId, relativePath},
           playlists[], savedPlaylists[], onTheGo[], history[≤500], alarms[], clocks[],
           lockCode, locked, notesFolder, calendars[], photosFolder, slide*, clock24,
           timeInTitle, resume{tracks|radio}
Track    ─ path, title, artist, albumArtist, album, genre, composer, trackNo, discNo,
           year, durationMs, compilation, gainDb?
Station  ─ slug(id), name, genre, description, pageUrl, streamUrl, streams[], image
QueueItem─ path, durationMs, stream, alternates[], gainDb?
```

### 6.9 Files on disk

| What | Windows | Linux | macOS |
|---|---|---|---|
| Settings `settings.json` | `%APPDATA%\Igumenov\WheelDesk\config\` | `~/.config/wheeldesk/` | `~/Library/Application Support/lt.Igumenov.WheelDesk/` |
| Cache: `library-cache.json`, `artwork/`, `radio-covers/` | `%LOCALAPPDATA%\Igumenov\WheelDesk\cache\` | `~/.cache/wheeldesk/` | `~/Library/Caches/lt.Igumenov.WheelDesk/` |

Caches can be deleted at any time; they are rebuilt.

### 6.10 Repository layout

```text
WheelDesk/
├─ src/                    React + TypeScript UI
│  ├─ core/                pure logic (menus, navigator, library, playback, games …) + tests
│  ├─ render/              canvas drawing (device, screen, views)
│  ├─ platform/bridge.ts   Rust bridge + browser demo data
│  └─ App.tsx, main.tsx
├─ src-tauri/              Tauri shell (commands, tray, window, config, icons)
├─ crates/core/            Rust core library
│  ├─ src/                 modules listed in §6.2
│  ├─ data/stations.tsv.gz built-in radio catalogue
│  ├─ examples/            volumes, decode, play, radio, switch, catalog
│  └─ tests/               format fixtures and integration tests
├─ scripts/                build scripts, catalogue builder, screenshot capture
├─ docs/images/            screenshots used by the documentation
├─ .github/workflows/ci.yml
├─ LICENSE · NOTICE.md · README.md · README.lt.md
```

---

## 7. Key algorithms

### 7.1 Wheel

The pointer angle around the wheel centre is tracked continuously; every **15°** of rotation is one
list step (24 per turn). The remainder is kept, so slow turning is never lost. On lists longer than
50 rows, steps faster than 45 ms are accelerated. A movement under 6° is a tap, not a turn. The
centre is a joystick: a 17 px core is play/pause, the four edges are up/down/MENU/open.

### 7.2 Text repair

Tags written by old Windows tools are often in Windows-1251 (Cyrillic) or 1257 (Baltic), or are UTF-8
that was decoded twice. `text.rs` checks for valid UTF-8 first, then detects mojibake patterns (for
example `РњРђ…` or `Ã…`), runs of 1251 letters inside mixed titles, and 1257 markers, and decodes
with the code page that yields real letters. ICY stream titles use the same logic.

### 7.3 Albums by folder

After scanning, each folder (with `CD1`/`Disc 2` sub-folders merged into the parent) is checked:
one shared album tag → all songs, including untagged ones, get it; mixed or no tags → the album is
named after the folder. Different artists in one folder become *Various Artists* and a compilation.
Missing artists and track numbers are inferred from names like `01 - Artist - Title.mp3`.

### 7.4 Sound

- **EQ:** ten RBJ peaking biquads (Q = 1.41) per channel, coefficients recomputed when the curve
  changes (checked every 256 frames), pre-gain of −0.75 × the largest boost and a soft clipper.
- **Sound Check:** ReplayGain from tags; otherwise the song is decoded in the background, 50 ms
  RMS blocks are measured and the 95th percentile is mapped to a −14 dBFS target (clamped −12…+9 dB).
- **Crossfade:** in the last 6 s the next song starts in a second sink; levels follow equal-power
  curves `cos(t·π/2)` / `sin(t·π/2)`; short songs and *Repeat One* are not faded.

### 7.5 Live streams

`stream.rs` asks for ICY metadata and strips it from the audio, follows `.pls/.m3u/.xspf/.asx`
playlists (up to 3 levels), plays HLS (master → media playlist, MPEG-TS demuxed to ADTS/MP3, ID3
removed) and feeds a ring buffer read by a separate decoder thread. When the buffer runs dry the
output is silence, never a blocked audio callback. Dropped streams reconnect up to five times.

### 7.6 Building the radio catalogue

```text
radio-playlists / Radio Browser export, CC0 (69,781 entries)
   │  parse fields, drop entries without http(s) stream, drop identical streams
   ▼
official_score(entry) ≥ 3 ?                         + own web site (not laut.fm, zeno.fm, social,
   │                                                  free hosting, aggregators)        +2
   │                                                + logo                              +1
   │                                                + FM/AM/DAB/frequency, public/community/
   │                                                  regional/news tags                +2
   │                                                + site on the country's domain      +1
   │                                                − web-radio/online/test tags        −4
   │                                                − hobby streaming platform          −3
   │                                                − "radio.<personal-site>"           −2
   ▼
merge duplicates: same country + same name key ("Radijo stotis Lietus" = "Radio Lietus")
                  + same web site → one station, all streams kept (direct first, HLS last)
   ▼
crates/core/data/stations.tsv.gz (≈33,700 stations, 3 MB) ─► catalog.rs at run time:
   tags → 23 genres (keyword rules; untagged → by name words; else "Other")
```

Run `python3 scripts/make-station-catalog.py <export.txt>` to rebuild (add `--all` to keep every
entry).

### 7.7 Calendars

`ics.ts` unfolds lines, unescapes text, reads `DTSTART/DTEND/DURATION`, all-day and UTC times, and
expands `RRULE` (DAILY, WEEKLY with BYDAY, MONTHLY — skipping months without that day — and YEARLY,
with INTERVAL, COUNT, UNTIL) minus `EXDATE`.

---

## 8. Build and release

| Target | Command | Output (in `release/<os>/`) |
|---|---|---|
| Windows 10/11 | `powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1` | `.msi`, `-setup.exe` |
| Windows from Linux | `./scripts/build-windows-from-linux.sh` | `-setup.exe`, portable `.zip` |
| Linux | `./scripts/build-linux.sh` (`--no-deps` to skip apt/dnf/pacman) | `.deb`, `.rpm`, `.AppImage` |
| macOS universal | `./scripts/build-macos.sh` | `.app`, `.dmg` |
| macOS Apple Silicon | double-click `Build WheelDesk for Apple Silicon.command` or `./scripts/build-macos.sh --install --arm` | `.app`, `.dmg` (arm64) |

Notes:

- The Windows cross-build uses MinGW, NSIS and a `-Zbuild-std` toolchain; no Windows machine is needed.
- macOS builds are signed ad hoc unless `APPLE_SIGNING_IDENTITY` (and notarisation variables) are set.
- The Linux `.deb` depends on `libayatana-appindicator3-1 | libappindicator3-1` for the tray.
- CI (`.github/workflows/ci.yml`) runs tests and builds Windows, Linux, macOS universal and
  macOS Apple Silicon packages on every push; a `v*` tag creates a draft release.
- Version lives in four places: `Cargo.toml`, `package.json`, `src-tauri/tauri.conf.json`,
  `APP_VERSION` in `src/App.tsx`.

**Release checklist:** bump version → `npm test` → `cargo test -p wheeldesk-core` → build packages →
install and start on each OS → play a file and a station → minimize/restore from the tray → close and
reopen (resume).

---

## 9. Testing

### 9.1 Strategy

```text
                 ┌─────────────────────────┐
                 │ manual acceptance on    │  real audio device, tray, installers,
                 │ Windows / Linux / macOS │  DPI, network radio
                 ├─────────────────────────┤
                 │ UI review in browser    │  every screen screenshot-checked
                 │ preview (demo data)     │  (scripts/capture-doc-images.py)
                 ├─────────────────────────┤
                 │ integration (Rust)      │  real MP3/FLAC/M4A/OGG/AIFF fixtures:
                 │                         │  tags, decoding, folder albums, DSP
                 ├─────────────────────────┤
                 │ unit (TS + Rust)        │  navigator & menus, wheel maths, library,
                 │                         │  ICS, games, DSP, catalogue, parsers
                 └─────────────────────────┘
```

### 9.2 Automated tests

| Suite | Count | Covers |
|---|---|---|
| `src/core/navigator.test.ts` | 44 | Every menu: navigation, settings, playlists, On-The-Go, search, radio filters, history, alarms, lock, EQ editor, volume limit, notes, calendars, photos, date & time, games, mouse control |
| `src/core/library.test.ts` | 13 | Sorting (“The …”), grouping, shuffles, time format |
| `src/core/wheel.test.ts` | 7 | Angles, ticks, acceleration, tap vs turn |
| `src/core/ics.test.ts` | 4 | Parsing, folding, weekly/monthly/yearly repeats, EXDATE |
| `src/core/games/games.test.ts` | 4 | Bricks physics and pause, quiz pool and scoring |
| Rust unit (`cargo test --lib`) | 66 | Volumes, settings, text repair, library inference, playlists, player rules, DSP (EQ response, smoothing, loudness, crossfade curve), streams (ICY, PLS/M3U/XSPF/ASX, HLS, TS), catalogue (genres, filters, merging), covers parsers, docs |
| Rust integration (`tests/formats.rs`) | 6 | All five formats decode, tags, folder album, Windows-1251 ID3v1, DSP on real files |

```bash
npm test                        # TypeScript
cargo test -p wheeldesk-core    # Rust
cargo run -p wheeldesk-core --example catalog   # catalogue statistics
cargo run -p wheeldesk-core --example volumes   # drives seen on this machine
```

### 9.3 Manual acceptance checklist

| # | Check | Expected |
|---|---|---|
| A1 | Install, start, close, start again | Starts without errors; settings kept |
| A2 | Library Source on a USB drive; replug on another letter/mount | Same folder found |
| A3 | Play each format; navigate menus while playing | No gaps or stutter |
| A4 | ⏮ at 1 s and at 10 s; hold ⏭ | Previous song vs restart; fast forward |
| A5 | EQ preset and Custom while playing | Audible change, no clicks |
| A6 | Radio: country → genre → station; ⏮ ⏭ | Plays; stays in the filtered list; song title marquee |
| A7 | A station whose first stream is dead | Next stream used automatically |
| A8 | Minimize, tray click, tray menu, Close | Hidden/restored; music continues; Close quits |
| A9 | Close while playing, reopen | Same song and position |
| A10 | Alarm one minute ahead with the window hidden | Window appears, sound plays, Snooze 9 min |
| A11 | 100 %, 150 %, 200 % display scaling | Sharp drawing, correct hit areas |
| A12 | Language RU/LT; Cyrillic/Lithuanian tags | All letters shown |

### 9.4 Not covered automatically

Real audio output, tray and window behaviour, installers, live radio availability and online cover
services (unreachable from CI) are verified manually.

---

## 10. User manual

### 10.1 Controls

<img src="docs/images/device-now-playing.png" width="260" align="right" alt="Device while playing">

| Action | Wheel / mouse | Keyboard |
|---|---|---|
| Move in a list | Turn the wheel (drag in a circle) or mouse wheel; joystick ▲ ▼ | ↑ ↓ |
| Select / open | Centre button; joystick ▶ | Enter |
| Back (MENU) | Top of the wheel; joystick ◀ | Esc, Backspace |
| Play / pause | Bottom of the wheel; centre core | Space |
| Previous / next | Left / right of the wheel (hold to seek) | ← → |
| Add to On-The-Go | Hold the centre button 0.7 s on a song, album, artist … | Hold Enter |
| Volume | Side **+ / −** keys on the right edge (hold to repeat); wheel in Now Playing | + / −, media keys |
| Move the window | Drag the chassis | — |
| Minimize / close | `–` / `×` on the chassis | — |
| Click menu rows | Optional: **Settings → Mouse Control** | — |

On slider screens (EQ editor, Volume Limit) joystick/arrow **up raises** the value.
<br clear="right">

### 10.2 Main menu

<img src="docs/images/main-menu.png" width="320" alt="Main menu">

| Item | What it does |
|---|---|
| **Music** | The music library (below) |
| **Photos** | Pictures from a folder you choose, with slideshow |
| **Podcasts** | World internet radio, filtered by country and genre |
| **Extras** | Alarms, Calendars, Clocks, History, Games, Notes, Screen Lock, Stopwatch |
| **Settings** | All settings |
| **Shuffle Songs** | Plays the whole library in random order |
| **Now Playing** | Appears when something is queued; returns to the playing screen |

The right half shows the cover of what is playing. Items can be added or hidden in
**Settings → Main Menu**.

### 10.3 Music

<img src="docs/images/music-menu.png" width="320" alt="Music menu"> <img src="docs/images/cover-flow.png" width="320" alt="Cover Flow">

| Item | Description |
|---|---|
| **Cover Flow** | Albums as a turning row of covers; turn the wheel, centre opens the album |
| **Playlists** | On-The-Go, your saved lists, imported files, **Import from PC…** |
| **Artists** | Artist → *All Songs* or an album → songs |
| **Albums** | All albums A–Z (“The” ignored), then songs in track order |
| **Compilations** | Albums by various artists |
| **Songs** | Every song A–Z |
| **Genres** | Genre → artists → albums → songs |
| **Composers** | Composer → songs |
| **Audiobooks** | `.m4b` files and books |
| **Search** | Type with the wheel's letter strip or the keyboard; ⏮ deletes, ⏭ goes to the results |

<img src="docs/images/search.png" width="220" alt="Search"> <img src="docs/images/album-songs.png" width="220" alt="Album songs"> <img src="docs/images/artists.png" width="220" alt="Artists">

**Playlists.** Hold the centre button on any song, album, artist or genre to add it to
**On-The-Go**. In On-The-Go: **Save Playlist** (becomes a named list), **Clear Playlist**.
**Import from PC…** browses drives for M3U/M3U8/PLS/XSPF/WPL files; imported files are re-read each
time, so edits on the PC show up. Missing songs are listed.

<img src="docs/images/playlists.png" width="320" alt="Playlists"> <img src="docs/images/on-the-go.png" width="320" alt="On-The-Go">

### 10.4 Now Playing

<img src="docs/images/now-playing.png" width="320" alt="Now Playing">

- Shows “*n* of *total*”, cover, title, artist, album, elapsed and remaining time.
- Wheel: volume. Centre: progress → **scrubber** (wheel seeks) → back. ⏮ ⏭ previous/next
  (⏮ after 3 s restarts the song).
- Double-click the cover: full-screen cover with the progress bar; double-click again to return.
- With Mouse Control on, click the progress bar to jump.

### 10.5 Podcasts — World Radio

<img src="docs/images/radio-menu.png" width="220" alt="Radio menu"> <img src="docs/images/radio-countries.png" width="220" alt="Countries"> <img src="docs/images/radio-country-genres.png" width="220" alt="Genres in a country">

| Item | Description |
|---|---|
| **Countries** | Country (with station count) → **All Stations** or a genre → stations |
| **Genres** | Genre → **All Countries** or a country → stations |
| **Recent Stations** | The last 30 stations you listened to (from History) |

<img src="docs/images/radio-stations.png" width="220" alt="Stations"> <img src="docs/images/radio-now-playing.png" width="220" alt="Radio playing"> <img src="docs/images/radio-genres.png" width="220" alt="Genres">

Choosing a station tunes in and opens Now Playing with a **LIVE** badge, the station name, the
current song as a scrolling line, genre and details, and a song cover when one is found. ⏮ ⏭ move to
the previous/next station **within the same filtered list**. Pause stops the stream (it resumes live,
not delayed). If a station's stream fails, its other known streams are tried automatically.

The catalogue contains only broadcasters (§7.6); 23 genres include Pop, Rock, News & Talk,
Classical, Jazz, Dance & Electronic, Oldies & Retro, Religious, Kids and *Other / untagged*.

### 10.6 Photos

<img src="docs/images/photos-menu.png" width="220" alt="Photos"> <img src="docs/images/photos-grid.png" width="220" alt="Photo grid"> <img src="docs/images/photo-full.png" width="220" alt="Photo">

| Item | Description |
|---|---|
| **All Photos** | Every picture in the chosen folder and its sub-folders (JPG, PNG, GIF, WebP, BMP) |
| *Album folders* | Each sub-folder is an album |
| **Slideshow Settings** | Time Per Slide (2–20 s), Repeat, Shuffle Photos, Transitions (cross-fade) |
| **Choose Folder…** | Drive → folder → *Use This Folder* |

Grid: wheel moves, ⏮ ⏭ page, centre opens the photo, ⏯ starts a slideshow. Photo view: wheel goes
to the previous/next photo, ⏯ starts/stops the slideshow, centre returns.

### 10.7 Extras

<img src="docs/images/extras-menu.png" width="320" alt="Extras">

| Item | Description |
|---|---|
| **Alarms** | **Create Alarm**; each alarm: On/Off, **Time** (wheel picker), **Repeat** (Once, Every Day, Weekdays, Weekends), **Alert** (Beep, Shuffle Songs, a saved or imported playlist), **Delete Alarm**. When it rings the window comes forward: **Dismiss** or **Snooze** (9 min) |
| **Calendars** | **Add Calendar File…** (.ics); a calendar or **All Calendars** opens a month view: wheel = day, ⏮ ⏭ = month, ⏯ = today, centre = the day's events → event details. **Remove Calendar** |
| **Clocks** | This computer's time plus world cities (**Add Clock** → region → city); each clock: octagonal face, date, offset; **Change City**, **Delete Clock** |
| **History** | Every song and radio song you played, newest first with time (“Yesterday 15:43”); select to play again; **Clear History**; up to 500 entries |
| **Games** | **Bricks** (wheel moves the paddle, centre launches/pauses, levels get faster) and **Music Quiz** (10 rounds: a song from your library plays, pick its title from four within 10 s) |
| **Notes** | Text files (.txt, .md) from a folder you choose; wheel scrolls, ⏮ ⏭ page; UTF-8, UTF-16 and old Windows code pages |
| **Screen Lock** | **Set Combination** (4 digits with the wheel or keyboard), **Lock**: everything is blocked until the code is entered, even after a restart |
| **Stopwatch** | **Timer**: ⏯ start/stop, centre = lap (or reset when stopped, saving a log); logs list with laps; **Clear Logs**. It keeps running while you use other menus |

<img src="docs/images/alarm-editor.png" width="220" alt="Alarm"> <img src="docs/images/alarm-ringing.png" width="220" alt="Alarm ringing"> <img src="docs/images/calendar-month.png" width="220" alt="Calendar">
<img src="docs/images/calendar-day.png" width="220" alt="Day"> <img src="docs/images/calendar-event.png" width="220" alt="Event"> <img src="docs/images/clocks.png" width="220" alt="Clocks">
<img src="docs/images/clock-face.png" width="220" alt="Clock"> <img src="docs/images/history.png" width="220" alt="History"> <img src="docs/images/games.png" width="220" alt="Games">
<img src="docs/images/game-bricks.png" width="220" alt="Bricks"> <img src="docs/images/game-music-quiz.png" width="220" alt="Music Quiz"> <img src="docs/images/notes.png" width="220" alt="Notes">
<img src="docs/images/note-reader.png" width="220" alt="Note"> <img src="docs/images/screen-lock-menu.png" width="220" alt="Screen Lock"> <img src="docs/images/screen-lock-combination.png" width="220" alt="Combination">
<img src="docs/images/stopwatch.png" width="220" alt="Stopwatch">

### 10.8 Settings

<img src="docs/images/settings-1.png" width="220" alt="Settings 1"> <img src="docs/images/settings-2.png" width="220" alt="Settings 2"> <img src="docs/images/settings-3.png" width="220" alt="Settings 3">

| Item | Description |
|---|---|
| **About** | Number of songs and albums, library source, version |
| **Shuffle** | Off · Songs · Albums |
| **Repeat** | Off · One · All |
| **Main Menu** | Turn main-menu items on/off (Music, Cover Flow, Playlists, Artists, Albums, Songs, Search, Photos, Podcasts, Extras, Alarms, Clocks, History, Stopwatch, Screen Lock, Shuffle Songs …); **Reset Menu**. Settings always stays |
| **Music Menu** | Turn Music menu items on/off; **Reset Menu** |
| **Volume Limit** | Maximum volume with the wheel; **Done** or **Lock Volume Limit** with a 4-digit code (then the code is needed to change it, and it survives *Reset Settings*); **Remove Lock** |
| **Backlight** | Screen dims after 2, 5, 10, 15, 20, 30 s or *Always On* |
| **Audio Crossfade** | On/Off — 6-second blend between songs |
| **Sound Check** | On/Off — same loudness for all songs |
| **EQ** | 22 presets (Acoustic … Vocal Booster) or **Custom**: ten bars 32 Hz–16 kHz, wheel ±0.5 dB, centre/⏭ next band, ⏮ previous, “0” flat |
| **Clicker** | Wheel click sound On/Off |
| **Mouse Control** | Off by default; when on, menu rows, progress bar, calendar days, photos and games react to clicks |
| **Date & Time** | Time, date and time zone of this computer; **24-Hour Clock**; **Time in Title** |
| **Language** | English, Lietuvių, Русский |
| **Library Source** | Drive (with size) → folders → **Use This Folder**; remembered by drive ID |
| **Legal** | Author, licence, open-source components and data sources |
| **Reset Settings** | **Cancel** / **Reset All** (library source, volume and a locked volume limit are kept) |

<img src="docs/images/eq-presets.png" width="220" alt="EQ presets"> <img src="docs/images/eq-editor.png" width="220" alt="EQ editor"> <img src="docs/images/volume-limit.png" width="220" alt="Volume Limit">
<img src="docs/images/main-menu-editor.png" width="220" alt="Main Menu editor"> <img src="docs/images/date-time.png" width="220" alt="Date & Time"> <img src="docs/images/library-source.png" width="220" alt="Library Source">
<img src="docs/images/library-folder.png" width="220" alt="Use This Folder"> <img src="docs/images/about.png" width="220" alt="About"> <img src="docs/images/legal.png" width="220" alt="Legal">

### 10.9 Tray, closing and resume

- **Minimize (`–`)** hides the player next to the system clock; music, radio and alarms continue.
  Click the tray icon to show/hide; right-click for *Show, Play/Pause, Next, Previous, Quit*.
  Without a tray (e.g. GNOME without the *AppIndicator* extension) minimize works normally.
- **Close (`×`)** quits completely.
- On the next start WheelDesk continues the same queue, song and position, or the same station in
  the same filtered list.

### 10.10 Troubleshooting

| Problem | What to do |
|---|---|
| No music listed | Check **Settings → Library Source**; supported formats are MP3, M4A, FLAC, OGG, AIFF |
| Wrong letters in titles | Usually fixed automatically; rescan by choosing the folder again |
| A station does not play | Try another; streams change — the catalogue is a snapshot |
| No covers | Covers need internet once; local `cover.jpg`/`folder.jpg` always work |
| No tray icon on Linux | Install `libayatana-appindicator3-1`; on GNOME enable *AppIndicator Support* |
| macOS: “cannot be opened” | Right-click → Open, or `xattr -cr /Applications/WheelDesk.app` |
| Start from scratch | Close the app, delete `settings.json` and the cache folder (§6.9) |

---

## 11. Privacy and network use

WheelDesk has no account, no telemetry and no analytics. Your library, history and settings stay in
local files. The app goes online only for:

| When | Where | What is sent |
|---|---|---|
| A cover is missing locally | musicbrainz.org, coverartarchive.org, theaudiodb.com, en.wikipedia.org | Artist and album (or song) name |
| You play a station | The station's stream server | A normal HTTP request (your IP address) |
| A radio song needs a cover | Same open cover sources | Artist and title from the stream |

Settings are not encrypted; the 4-digit codes are a convenience lock, not security.

---

## 12. Limitations and roadmap

**Known limitations**

- Canvas UI: no screen-reader semantics yet.
- Radio catalogue is a snapshot; “official” is a heuristic score (§7.6) and some web-only stations
  remain; stream availability changes.
- Notes and calendars are read-only; ICS support covers the common recurrence rules only.
- macOS packages must be built on a Mac or in CI.
- Alarms ring only while the app is running and the computer is awake.

**Ideas for next versions:** keyboard-accessible text alternative for screen readers, station search
by name, favourites for stations, lyrics from embedded tags, podcast RSS feeds next to radio,
signed and notarised macOS builds.

---

## 13. Contributing

- **Add a menu item:** add a string key to `src/core/strings.ts` (EN, LT, RU), create the screen in
  `src/core/menus.ts` (items or a custom `draw`), add a test in `navigator.test.ts`.
- **Add a language:** add a table in `strings.ts` and a choice in *Settings → Language*; the bundled
  Inter font covers Latin, Latin Extended and Cyrillic.
- **Add a genre rule:** edit `RULES` in `crates/core/src/catalog.rs`; extend `tags_become_genres`.
- **Refresh the radio catalogue:** `python3 scripts/make-station-catalog.py <export.txt>`.
- **Refresh screenshots:** see [`docs/images/README.md`](docs/images/README.md).
- Style: TypeScript strict mode, `cargo fmt`, comments explain *why*. Every change keeps
  `npm test` and `cargo test -p wheeldesk-core` green.

---

## 14. Licence and attribution

WheelDesk is released under the **[MIT License](LICENSE)**.

```text
Copyright (c) 2026 Aleksandr Igumenov (original idea and first author) and WheelDesk contributors
```

**Anyone may use, study, change and share this project — including for learning and teaching.**
The MIT licence requires that the copyright notice above and the licence text stay in all copies or
substantial parts of the software, so the original author's name travels with every copy.

When you use WheelDesk in a course, a thesis, an article or a derived project, please credit it as:

> *WheelDesk — retro click-wheel music player. Original idea and first author: Aleksandr Igumenov.
> https://github.com/A-Igumenov/WheelDesk (MIT License).*

### Third-party components

The MIT licence of WheelDesk covers its own code. Libraries keep their own licences, all of which
allow this use:

| Component | Licence |
|---|---|
| Tauri, `@tauri-apps/api`, `@tauri-apps/cli` | Apache-2.0 OR MIT |
| React, React DOM, Vite, Vitest | MIT |
| TypeScript | Apache-2.0 |
| rodio, cpal, lofty, serde, rayon, ureq, flate2, directories, base64 | MIT OR Apache-2.0 |
| Symphonia (audio decoding) | MPL-2.0 (file-level copyleft; used unmodified) |
| encoding_rs | (Apache-2.0 OR MIT) AND BSD-3-Clause |
| sysinfo | MIT |
| walkdir | Unlicense OR MIT |
| Inter typeface (`@fontsource/inter`) | SIL Open Font License 1.1 |

Of 507 Rust packages in `Cargo.lock`, the licences are MIT, Apache-2.0, BSD, ISC, Zlib, Unicode-3.0,
Unlicense or MPL-2.0 — all compatible with distributing WheelDesk under MIT. When redistributing
binaries, keep the notices of these components (for example by shipping their licence texts).

### Data sources

| Data | Source | Licence / terms | How it is used |
|---|---|---|---|
| World radio station catalogue (`crates/core/data/stations.tsv.gz`) | [AlonDrilich/radio-playlists](https://github.com/AlonDrilich/radio-playlists) — weekly snapshot of the [Radio Browser](https://www.radio-browser.info/) community directory | Station data: **CC0 1.0** (public domain dedication, file `LICENSE-DATA` in that repository); its scripts: MIT | Filtered to broadcasters, duplicates merged, converted by `scripts/make-station-catalog.py`; bundled in the app |
| Station names, logos, streams | The radio stations themselves | Remain the property of the respective stations | Shown and played directly from the stations' servers; logos and audio are not redistributed |
| Album and song covers | MusicBrainz / Cover Art Archive, TheAudioDB, Wikipedia | Each source's own terms | Looked up only when a local cover is missing; cached locally, never redistributed |

CC0 does not require attribution, but we credit the catalogue's origin above and in
**Settings → Legal**. See also [`NOTICE.md`](NOTICE.md).

**Trademarks:** WheelDesk is an independent project. It is not affiliated with, endorsed or
sponsored by any device maker; the click-wheel interaction is re-implemented with an original design.
