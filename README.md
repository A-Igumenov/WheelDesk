# WheelDesk 1.3.0

[Project repository](https://github.com/A-Igumenov/WheelDesk).

[Lietuviškai](README_LT.md)

WheelDesk is a desktop music player designed to bring an **iPod-like operating experience** to **Windows, Linux, and macOS**: a virtual wheel, hierarchical menus, a centre selection button, MENU navigation, and music browsing without interrupting playback. Cross-platform support is an implementation goal of that original idea.

Version 1.3 adds an international radio catalogue inside **Podcasts → country → station**. The main menu label remains Podcasts (Tinklalaidės in Lithuanian and Подкасты in Russian). The bundled catalogue contains **33,936 stations from 218 countries and territories**, including **50 Lithuanian stations**. Lithuania appears first. Next/previous station stays within the selected country.

Documentation and recorded checks: **24 October 2026**. Automated checks: **154 TypeScript tests, 86 Rust tests**. Manual acceptance and live stream availability are separate checks.

## Contents

1. [Product idea and scope](#product)
2. [Requirements and acceptance criteria](#requirements)
3. [Architecture, technology choices, and portability](#architecture)
4. [Prototype and interaction design](#prototype)
5. [Implementation principles](#implementation)
6. [End-user manual](#manual)
7. [Licensing, services, and privacy](#licensing)
8. [Review scope and limitations](#audit)
9. [Testing and acceptance matrix](#testing)
10. [Radio catalogue](#catalogue)
11. [Dependency licence inventory](#inventory)
12. [Version history](#history)

<a id="product"></a>
## 1. Product idea and scope

The original idea is a computer music player whose behaviour resembles an iPod. Its defining interaction is turning the wheel, selecting with the centre button, returning through MENU, and browsing artists, albums, and tracks while audio continues. WheelDesk presents this experience in a small desktop device view. Internet radio supplements a local collection.

The intended audience includes local music collectors, internet radio listeners, and developers studying TypeScript/Rust integration, audio processing, and desktop application architecture. The interface and core are shared between operating systems; platform-specific code handles disks, audio devices, windows, the tray, and installers.

Typical scenarios:

1. Select a drive and music folder, wait for scanning, open an album, and play a track.
2. Build an On-The-Go list while listening, save it, and adjust EQ without interrupting audio.
3. Hide the window to the system tray and later resume the listening session.
4. Open Podcasts, select a country and station, and view track metadata when the station supplies it.
5. View local photos, notes, and calendars, or use clocks, alarms, the stopwatch, and games within the same device interface.

The implementation includes a local library, playback, radio, artwork, search, imported and internal playlists, EQ, Sound Check, Crossfade, volume limits, photos, text documents, ICS calendars, clocks, alarms, a stopwatch, screen lock, two games, and Lithuanian/English/Russian interface text.

Product boundaries: this is a desktop application. Browser mode demonstrates the UI and simulates playback. Cloud accounts, subscription catalogues, DRM unlocking, and cross-computer library synchronization are not implemented. Stable volume IDs do not make absolute playlist and track paths portable between operating systems. Notes and calendars are read-only. Canvas does not automatically provide semantic screen-reader controls. Alarms require the application to remain running and the computer to remain awake.

Acceptance is based on real workflows: select a library, decode all supported fixture formats, navigate while playing, restore playback after restart, and install the appropriate package on each supported OS. Performance claims require recorded collection sizes, hardware, OS versions, startup/scanning times, and memory measurements.

<a id="requirements"></a>
## 2. Requirements and acceptance criteria

“Implemented” means the behaviour exists in the source; it does not certify every operating system or input. P1 denotes core functionality and P2 an additional feature. This is a specification reconstructed from the current implementation, rather than a previously approved customer requirements contract.

| ID / priority | Requirement and implementation evidence | Acceptance criterion |
| --- | --- | --- |
| F01 / P1 | Wheel, keyboard, navigation stack: `src/core/wheel.ts`, `navigator.ts`, `src/render/device.ts` | Rotation and Up/Down change selection; Enter opens; Esc returns |
| F02 / P1 | Volume and relative folder selection: `crates/core/src/volumes.rs` | A stable ID restores the source after mount changes; a missing drive does not crash the application |
| F03 / P1 | MP3, M4A/AAC, FLAC, OGG, AIFF scanning and tags: `library.rs`, `tests/formats.rs` | All five fixture formats are found and decoded; WAV is skipped by library scanning |
| F04 / P1 | Playback, pause, queue, seek, Shuffle, Repeat: `player.rs`, `src/core/playback.ts` | Navigation remains usable during playback; transport and end-of-queue behaviour follow the selected mode |
| F05 / P1 | Grouping, Cover Flow, search: `library.ts`, `search.ts`, `menus.ts` | Search handles Lithuanian/Cyrillic text and accent normalization; library groups are correct |
| F06 / P1 | Imported playlists and On-The-Go: `playlists.rs`, `menus.ts` | PLS/XSPF/WPL open; holding the centre adds an entry; saved lists survive restart |
| F07 / P1 | International radio by country: `radio_catalog.rs`, `src/core/radio.ts`, `stream.rs` | 33,936 stations, 218 countries; Lithuania first; counts visible; next/previous stays in the country; buffering/errors and supplied ICY titles are shown |
| F08 / P2 | Local/libre first-album artwork: `art.rs`, `open_art.rs`, `openart.ts` | Local artwork displays; remote artwork requires attribution and a libre licence; missing artwork does not block audio |
| F09 / P1 | Ten-band EQ, Sound Check, Crossfade, volume cap: `dsp.rs`, `player.rs` | Changes apply during playback; application volume cannot exceed its configured cap |
| F10 / P1 | Resume and up to 500 history entries: `App.tsx`, `menus.ts` | Queue, track, position and pause state restore; history can be replayed and cleared |
| F11 / P2 | JPG/PNG/GIF/WebP/BMP and slideshow: `photos.ts` | Folder images display in a grid/full view; timing, repeat, shuffle and transition settings work |
| F12 / P2 | TXT/MD and ICS reading: `docs.rs`, `src/core/ics.ts` | UTF-8/UTF-16 documents open; supported recurrence and EXDATE rules are reflected |
| F13 / P2 | Alarms, clocks, stopwatch, screen lock: corresponding core modules | An alarm fires in the running application; the timer continues across menus; locking survives restart |
| F14 / P2 | Bricks and Music Quiz: `src/core/games` | Games start and respond to controls; the quiz uses an eligible music pool |
| F15 / P1 | LT/EN/RU and customizable menus/settings: `strings.ts`, `menus.ts` | Language and settings persist after restart |
| F16 / P1 | Window, tray, exit: `src-tauri/src/lib.rs`, `bridge.ts` | Minimize preserves audio; tray Show restores the window; Close exits; missing tray support falls back to minimizing |

| ID | Quality/operational requirement | Verification and limits |
| --- | --- | --- |
| N01 | Equivalent behaviour on Windows, Linux, macOS | Separate OS checks plus manual audio, tray, input and installer checks |
| N02 | Scanning must not block UI interaction | Rayon/background tasks exist; large-library responsiveness still needs measurement |
| N03 | Settings stored outside the install directory; corrupt JSON does not prevent startup | ProjectDirs, defaults, temporary-file write then rename |
| N04 | Local music available without internet | Test offline with local files; radio requires internet access |
| N05 | Document external data use | Artist/album/song metadata may be sent to artwork providers |
| N06 | Testability | Automated checks cover core logic; OS integration has separate scenarios |
| N07 | Accessibility | Keyboard support exists; screen-reader, contrast, and DPI acceptance remain separate work |
| N08 | Distribution readiness | Consistent licensing, third-party notices, signing, and OS acceptance evidence |

Four-digit screen/volume codes are UI controls stored in settings, not encryption or OS access control. The volume cap controls application volume, not the whole computer.

<a id="architecture"></a>
## 3. Architecture, technology choices, and portability

### Component diagram

```text
+----------------------------- User ----------------------------+
| Mouse / touch: wheel, centre, MENU, transport, volume          |
| Keyboard: navigation, selection, pause, volume                 |
+-------------------------------+-------------------------------+
                                v
+---------------- React / TypeScript / Canvas ------------------+
| App.tsx: startup, state, resume, alarm polling                 |
| src/core: Navigator, menus, Library, Playback, ICS, games       |
| src/render: DeviceView, screens, text and image caches         |
+-------------------------------+-------------------------------+
                                v
+------------------- src/platform/bridge.ts --------------------+
| Tauri invoke/listen contracts | Browser demo + localStorage    |
+-------------------------------+-------------------------------+
                                | IPC commands / events
                                v
+--------------------- src-tauri/src/lib.rs ---------------------+
| AppState | commands | background tasks | window | system tray  |
+-------------------------------+-------------------------------+
                                v
+------------------------- crates/core -------------------------+
| volumes + settings | library + playlists | docs + text         |
| radio_catalog + art + open_art + radio + stream                |
| Player thread -> DSP -> rodio / cpal -> operating system audio |
+----------+---------------------+----------------------+--------+
           v                     v                      v
   Drives / JSON / cache    HTTP(S) services       Audio device
   Windows/Linux/macOS      and radio streams
```

These are logical components, not separate servers. React runs in the system WebView; Rust runs locally, with audio on its own thread. Menu and rendering modules currently depend on each other in places: `src/core` is not fully isolated from presentation.

### Technology rationale

This explains the present choices; it is not a historical architecture decision log.

| Technology | Role and rationale | Trade-off |
| --- | --- | --- |
| Tauri 2 | Rust IPC, native installers, window/tray using the OS WebView | OS WebView differences; Electron would bundle its own browser runtime |
| React 18 + TypeScript | Startup, lifecycle, typed contracts | Much menu logic is imperative; static types do not replace runtime IPC validation |
| Canvas 2D + Inter | Shared device geometry, wheel, screen, multi-script text | Hit testing and accessibility require explicit work; DOM controls provide more native semantics |
| Rust 2021 | File, network, audio and platform code in one core | Separate toolchain and platform libraries |
| rodio / cpal / Symphonia | Playback, OS audio access, decoding | Real devices and codec variants require testing; transitive licences must be checked |
| lofty / walkdir / rayon | Tags, traversal, parallel scanning | Permissions, encodings and collection edge cases |
| serde / serde_json / directories | JSON contracts and per-OS storage | Schema evolution and path portability remain application responsibilities |
| ureq with TLS/JSON | Streams and external metadata | Provider availability, timeouts, terms and changing formats |
| Vite 6 / tsc / Vitest 3 | Development server, type checking, logic tests | Browser tests do not replace native integration checks |

Manifests declare version ranges; lockfiles record resolved versions.

### Data flow

1. App loads settings, volumes, and saved playback through the bridge.
2. LibrarySource stores a volumeId and a relative path. Rust resolves the mounted volume, loads cached indexing data, and rescans changed files.
3. UI Track objects are grouped into artists/albums and other views. Playback constructs the selected queue.
4. player_load/player_cmd pass requests to the Rust Player thread, which decodes, applies DSP, outputs audio, and emits state updates.
5. Local embedded/folder artwork comes first. The current song may use open first-album metadata and a verified libre Commons image as a fallback.
6. Resume stores paths, queue index, position and playing state, or a station slug. State is periodically saved at ten-second intervals and on pause/close.
7. Radio loads the shared bundled JSON. A country index is built once per catalogue. Player receives the selected country's station list.

### Storage and OS boundaries

No database server is required. Settings use camelCase JSON; Rust preserves UI-only fields through serde(flatten). The library index and artwork live in cache directories. Browser localStorage is separate from native settings.

| OS | Settings directory used through ProjectDirs |
| --- | --- |
| Windows | `%APPDATA%\Igumenov\WheelDesk\config` |
| Linux | `$XDG_CONFIG_HOME/wheeldesk`, normally `~/.config/wheeldesk` |
| macOS | `~/Library/Application Support/lt.Igumenov.WheelDesk` |

The settings file is settings.json; ProjectDirs::cache_dir() resolves the cache separately. If resolution fails, native code falls back to the working directory and its cache subfolder. Absolute track/playlist paths are not a universal cross-OS interchange format.

| Area | Windows | Linux | macOS |
| --- | --- | --- | --- |
| WebView | WebView2 | WebKitGTK 4.1 | System WebKit |
| Volume identity | Win32 volume identifier | /dev/disk/by-uuid | diskutil info -plist VolumeUUID |
| Fallback ID | mnt:mount path | Same | Same |
| Tray | Tauri tray | Desktop/AppIndicator support needed | Menu-bar tray |
| Packages | MSI, NSIS EXE | DEB, RPM, AppImage | APP, DMG; universal or ARM |

Fallback mount-path IDs are not stable when a drive moves. Linux packages do not imply compatibility with every distribution. Platform and processor compatibility must be verified separately.

Capabilities allow core/window operations. CSP restricts WebView sources, but asset-protocol access currently allows `**` and Rust commands accept local paths. This is broad local application access; filesystem permissions still apply. Consider narrowing access to selected folders for local file access.

<a id="prototype"></a>
## 4. Prototype and interaction design

![WheelDesk conceptual prototype](docs/assets/wheeldesk-prototype.png)

[Editable SVG](docs/assets/wheeldesk-prototype.svg). This is a generated documentation mockup, not an application screenshot. It follows theme.ts geometry: a 360×600 front panel, a 20×12 depth projection, overall 380×612 logical pixels, a 320×240 screen, and an octagonal wheel. Menu/artwork content is illustrative. The PNG was rendered from the SVG and visually inspected.

```text
Startup -> settings -> resolve source -> main menu
                         |
                   cache + scan
                         v
Music -> artist / album -> track -> Now Playing
  |                                  +-> volume / scrub
  +-> search / playlists
  +-> hold centre -> On-The-Go
Podcasts -> country -> station -> buffering -> live stream
Settings -> source / language / EQ / limits / preferences
Extras -> history / notes / calendars / clocks / games
```

Separate states include empty library, scanning, error, radio buffering, locked screen, and ringing alarm. The main-menu mockup alone does not specify all interactions.

Visual acceptance includes matching painted controls and hit areas, long titles, 100/150/200% DPI, Latin-Extended/Cyrillic text, inactive windows, dimming and tray restoration on all OSes. devicePixelRatio scaling alone does not certify all WebView/DPI cases.

<a id="implementation"></a>
## 5. Implementation principles

1. Define the product idea, requirements and consistent Windows/Linux/macOS behaviour.
2. Implement the chassis, wheel interaction, navigation and demonstration mode.
3. Define TypeScript/Rust data contracts, commands and events.
4. Implement settings, volume identity, library indexing and metadata reading.
5. Implement playback queues, decoding, transport, state reporting and error handling.
6. Add search, playlists, artwork and country-filtered radio.
7. Integrate EQ, loudness normalization, transitions, photos and extras.
8. Verify features with automated tests and real workflows on the target operating systems.

The interface and audio core share code; OS-specific differences are isolated in disk, filesystem, window, tray and audio integration. Changes are linked to requirement identifiers and test evidence.

<a id="manual"></a>
## 6. End-user manual

### Installation and first use

Select the package matching the OS and processor from a trusted distribution. Windows: run MSI or setup EXE. Linux: use the distro package manager for DEB/RPM, or make AppImage executable and run it. macOS: open DMG and copy WheelDesk.app to Applications; use ARM or universal on Apple Silicon.

If macOS blocks an unsigned/unnotarized application, verify its origin and use the OS's per-application Privacy & Security approval flow. Windows needs WebView2; Linux needs compatible WebKitGTK and audio libraries. Acceptance results are recorded in the testing section.

Open **Settings → Library Source**, choose a drive and music folder, wait for scanning, then select **Music → Albums** or **Songs**. Empty results can mean the wrong folder, an unavailable drive, permissions, or unsupported formats. Interface language can be changed to Lithuanian, English or Russian.

### Controls

| Action | Input |
| --- | --- |
| Move selection | Virtual wheel, mouse wheel/touchpad, Up/Down |
| Open selection | Centre button or Enter |
| Back | MENU, Esc, Backspace |
| Play/pause | Bottom wheel button or Space; centre core also acts as transport |
| Previous/next | Left/right wheel buttons or Left/Right arrows |
| Seek | Hold previous/next; in Now Playing use the centre to switch to scrubbing |
| Volume | Side +/−, keyboard +/−; wheel in Now Playing |
| On-The-Go | Hold centre on a music entry, or hold Enter |
| Move window | Drag the chassis or screen |
| Hide/exit | Chassis minimize/close controls |

Centre edges provide joystick navigation. **Settings → Mouse Control** enables direct menu-row clicking; it is off by default. Search accepts keyboard text.

### Music, playlists and history

Browse artists, albums, songs, genres, composers, compilations and audiobooks. Search matches word prefixes, ignores case/accents, and supports Lithuanian/Cyrillic text; it does not invent transliteration. MP3, M4A/AAC, FLAC, OGG and AIFF are scanned; WAV is skipped. A file extension does not guarantee every internal codec variant will decode.

Now Playing shows the track, progress and queue position. Previous after more than three seconds first restarts the current track. Double-click artwork for full view. Shuffle and Repeat are configured in settings. Close saves queue, position and play/pause state; files must remain available. An abrupt termination can lose progress since the last periodic save.

**Extras → History** keeps up to 500 started tracks/radio songs, newest first with timestamps. Replay an entry or clear history.

With **Mouse Control** enabled, screen selection and Back continue to work while the selected music source is being scanned. In manual EQ, the small joystick top and keyboard ↑ increase the band value; bottom and ↓ decrease it. Rotary direction remains unchanged.

### Radio and artwork

Open **Podcasts → country → station**. Lithuania appears first with 50 stations; counts accompany country names. Browsing the bundled catalogue is offline. Listening and online images require a network connection. Next/previous stays in the selected country, wrapping at the ends. MENU returns to stations/countries. Supplied genre and logo metadata is shown where available; it is not a guarantee of authenticity or availability.

Track metadata is shown if the stream transmits it. Pausing a live stream does not create a delayed recording: resuming reconnects live. Unsupported/unavailable streams may report errors. MP3/AAC/OGG, PLS/XSPF lists and HLS are supported, subject to the source's actual encoding and accessibility.

Local embedded/folder artwork comes first. If it is missing, the current song is matched by artist and title to the earliest dated official Album found in MusicBrainz recording data. Compilation, Live, Remix and DJ-mix groups are excluded. Its Wikidata album entity supplies a Commons image reference; arbitrary artist photos are not substituted.

Each image must have explicit CC0, public-domain, CC BY or CC BY-SA terms. Unknown licences, additional restrictions and missing required attribution are rejected. Missing metadata or a libre cover never stops audio. This finds the earliest known album in available metadata, not a guaranteed complete historical discography.

The **Wikimedia Commons · licence · i** line opens full author, credit, album/date, source and licence URIs when clicked (Mouse Control) or when **i** is pressed. Session attributions also appear in **Settings → Legal**. The original image file is unchanged; display resizing/cropping is declared. There is no library-wide background image crawl. Requests are bounded, at most two run at once, MusicBrainz starts are at least 1.1 seconds apart, and results are cached for one day.

### Audio settings

EQ offers presets and a Custom ten-band curve from 32 Hz to 16 kHz, ±12 dB. Changes apply while playing. Sound Check uses ReplayGain or measured loudness. Audio Crossfade overlaps the end/start of tracks, with exceptions for short tracks and Repeat One. Volume Limit caps application volume and can be protected by four digits; resetting ordinary settings does not remove the cap. Codes are not encryption.

### Photos and extras

- **Photos:** choose a folder, browse albums and a 4×3 grid, open full view or a slideshow. Timing is 2–20 seconds with repeat, shuffle and fade. Supported image decoding also depends on the WebView; animated GIF playback is not separately guaranteed.
- **Extras → Notes:** read TXT/MD from a folder. This is not a Markdown editor. UTF-8, BOM-based UTF-16 and legacy encodings are handled; reads are capped at 512 KiB, so large files may be truncated.
- **Extras → Calendars:** add ICS files and view their combined events. Supported recurrence and EXDATE are implemented, not the entire ICS standard.
- **Alarms:** set time, repeat and beep/music source. Snooze is nine minutes. The app must be running and the computer awake.
- **Clocks / Date & Time:** add cities, choose 12/24-hour format and title time. Dates/time zones use OS data.
- **Stopwatch:** transport starts/stops, centre records laps; reset while stopped stores the session log. It continues across menus.
- **Screen Lock:** set/enter four digits; lock state persists across restart. This does not protect files against someone with settings access.
- **Games:** Bricks and Music Quiz. The quiz requires enough long tracks with distinct titles.

### Background operation, backups and removal

Minimize hides to the tray when supported; audio and alarms continue. The tray offers Show, playback controls and Quit. Linux without tray support uses ordinary minimization. Close exits fully.

Close the application before backing up settings.json from the OS configuration directory. Keep original music and external playlists separately; caches are rebuildable and do not replace backups. A different computer/OS may require reselecting sources and paths. Settings can contain file paths, history and lock codes; redact before sharing.

Uninstall through Windows Installed Apps, the Linux package manager (or remove AppImage), or macOS Applications. Removing settings/cache is separate and should follow backup.

| Symptom | Check |
| --- | --- |
| No music found | Drive, folder, permissions, format; reselect Library Source |
| Source missing after mount changes | Reconnect; reselect if fallback mnt: ID was used |
| No audio | Application/OS volume, cap, output device, another known-good file |
| Radio fails | Network and another station; URL, geography or provider may have changed |
| No artwork | Check local artwork; open services may lack a libre cover or an exact album link |
| Settings lost | Write permissions and JSON backup; missing/corrupt JSON loads defaults |
| Alarm did not fire | App running, awake computer, OS clock and repeat day |
| No Linux tray | Desktop AppIndicator support and libraries |
| PowerShell blocks npm | Use npm.cmd |

Bug reports should include version, OS/CPU, reproduction steps, expected/actual result and redacted error text.

<a id="licensing"></a>
## 7. Licensing, services and privacy

### Project licence

WheelDesk code and original project assets use the **MIT** licence; see the complete [LICENSE](LICENSE). It permits use, study, modification and redistribution while retaining the licence and copyright notice. The educational purpose does not add a usage restriction. Cargo and npm metadata consistently declare MIT.

### Dependencies and required notices

**674 exact-version dependencies were checked: 505 Cargo and 169 npm**. The review includes direct, transitive, development and optional platform packages, including Windows, Linux and macOS ARM. Each record preserves its official declaration, licence text, evidence URL, integrity/hash information and obligations. No missing manifests or unidentified dependency licences remain.

The [licence register](licenses/inventory.json), [obligations](licenses/OBLIGATIONS.txt) and complete `licenses` directory form part of this documentation. Where upstream omits a standalone text, the record identifies the standard text and the exact package declaration; platform variants retain their parent project's matching terms. Third-party components are not relicensed to MIT.

- MIT, BSD, ISC, Apache, Unicode and other applicable licence texts and existing copyright/NOTICE attribution are retained.
- Inter is unmodified; its attribution and OFL-1.1 accompany it. The font is not sold separately.
- Exact unmodified MPL-2.0 component sources are included in `licenses/sources`; each register entry identifies its archive. MPL continues to cover those files.
- CC-BY-4.0 and CDLA data terms and attribution are retained. Alternative licences offer a choice; AND expressions require all listed terms.
- The application icon has an original reproducible design; the prototype and synthetic audio test signals are project assets. See [asset provenance](licenses/ASSETS.txt).
- AppImage terms for 200 files from 117 OS packages and loader terms are in `licenses/linux-runtime`. Corresponding sources for 59 packages and the loader LGPL component are in `corresponding-source` and accompany the notices. Separately installed OS libraries retain their providers' terms.

Windows WebView2 SDK 1.0.3800.47 loader BSD-3-Clause terms and Microsoft notices are retained [separately](licenses/windows-webview2/LICENSE.txt); the Rust wrapper MIT licence does not replace them. The Evergreen runtime is installed separately under Microsoft terms. macOS system WebKit and OS frameworks are not redistributed as project source.

Rust standard-library and component attribution is retained in `licenses/rust-standard-library`: Windows Rust 1.99.1, Linux Rust 1.93.1. This supplements the locked-dependency register because the standard library does not appear in Cargo.lock.

### Radio data and external rights

Radio directory metadata is a Radio Browser selection from [radio-playlists](https://github.com/AlonDrilich/radio-playlists), under [CC0-1.0](licenses/radio-catalogue-CC0.txt); see [evidence](licenses/catalogue-evidence.json). This does not license station audio or trademarks. Streams are accessed directly from their providers; recordings and station logos are not distributed with the application. Commercial image catalogues are not used. Open-source-service lookups require per-file libre licence checks; see [terms](licenses/OPEN_ARTWORK.txt). User-supplied music and images retain their applicable rights.

WheelDesk is independent. Its iPod-inspired interaction does not imply Apple endorsement or partnership.

### Privacy

Library, settings and history are stored locally. Local artwork comes from user-supplied tags or folders. If it is missing, the current song artist/title go to MusicBrainz, album identifiers to Wikidata, and image names/requests to Wikimedia Commons. Normal connection information is visible to those servers. Supplementary MusicBrainz ratings, user text and other restricted datasets are not used. The directory loads locally. Selecting an internet station connects to its stream and possible redirect servers, exposing normal connection information including the IP address. A station may resume from saved playback state. Settings are not encrypted.

<a id="audit"></a>
## 8. Review scope and limitations

The initial 24 October 2026 inventory found 97 supported analysable files and roughly 70,000 words, including code, documentation, configuration and images; this was not a count of every filesystem object. Binary media/icons were inspected by role and references, not as source text.

The interface, audio core, platform integration, configuration and test sources were reviewed. This is a feature/documentation review, not a complete security audit.

Findings included inconsistent licensing, missing high-level specifications, excessive privacy claims, platform-specific integration limits, and test gaps. Version 1.3 adds the catalogue, country menus, XSPF handling and tests, removes mass station lookups, and associates transport/resume with the selected country. The original source inventory is historical v1.2 scope rather than a new v1.3 file count.

The browser demo's country screen and Lithuanian station list were visually checked, including Lithuania first with 50 stations and displayed genres. Local Markdown links, closed code fences, SVG structure and prototype rendering were checked. Live audio, full manual acceptance, screen readers, large-library performance, all station URLs, and every architecture remain separate checks.

<a id="testing"></a>
## 9. Testing and acceptance matrix

The suite combines logic/file/decoder tests with manual native acceptance. Coverage of all feature areas is not a claim of 100% line/input coverage. Mocks/browser mode do not test native windows or audible output.

| Area | Automated evidence | Manual gap |
| --- | --- | --- |
| F01 | wheel.test.ts, navigator.test.ts | Real pointer/touchpad, holds, DPI |
| F02 | volumes.rs, Library Source navigation | USB remount on each OS |
| F03 | library.rs, text.rs, formats.rs, regression.rs | Large collections and codec variants |
| F04 | player.rs, playback.test.ts, navigation/library tests | Audible output and device changes |
| F05 | library.test.ts, regression.test.ts, navigation | Cover Flow appearance and long text |
| F06 | playlists.rs, Rust regression, On-The-Go navigation | Real external paths and restart |
| F07 | radio_catalog.rs, radio.rs, stream.rs, radio.test.ts, country navigation | Live stream availability/network failure |
| F08 | art.rs, open_art.rs, openart.test.ts, attribution navigation, formats.rs | Embedded/folder images, missing/corrupt images |
| F09 | dsp.rs, player.rs, formats.rs, playback/regression tests | Audible processing and caps |
| F10 | playback.test.ts, bridge.test.ts, Rust regression, History | Full App lifecycle, periodic saves, 500-entry cap |
| F11 | Photos navigation, discovery regression | WebView decoding/slideshow/memory |
| F12 | docs.rs, regression.rs, ics.test.ts, navigation | Real documents/calendars |
| F13 | regression.test.ts, library.test.ts, alarm/lock/clock/timer navigation | Background ringing, snooze, window showing |
| F14 | games.test.ts, game navigation | Rendering/input/preview audio/exit |
| F15 | language/settings navigation, bridge.test.ts, settings.rs | Complete translations/native persistence |
| F16 | No automated native window/tray E2E coverage | Minimize, tray, Close, alarm window |

Earlier added regressions include 21 playback tests (resume, transport, volume, asynchronous station ordering/failure, metadata), 39 boundary tests (alarms, EQ, time/DST, stopwatch, search), five browser persistence tests, and six Rust file/settings regressions. Version 1.3 adds five TypeScript and three Rust tests for the catalogue, country navigation, XSPF and catalogue processing. The full source fixtures test supported audio decoding, metadata, embedded artwork, audio-device-optional queues and DSP.

### Manual acceptance cases

Prepare permitted test media: five audio formats, two albums/artists, LT/RU names, corrupt audio, a USB drive, five playlist formats, photo subfolders, TXT/MD/ICS and available radio streams. Avoid critical data. Run on Windows, Linux and macOS ARM; add Intel/universal or Windows ARM64 if those packages are distributed.

| ID / requirement | Steps | Expected result |
| --- | --- | --- |
| T01 / N01,N08 | Clean install matching OS/CPU; launch, close, relaunch | Starts without development tools; record version/hash |
| T02 / F01 | Wheel both directions, touchpad, arrows, Enter/Esc, centre hold | Correct navigation without duplicate/stuck actions |
| T03 / F02 | USB source, restart, unplug/replug at another mount | Stable ID resolves; missing drive safe; distinguish mnt: fallback |
| T04 / F03 | Scan five formats, corrupt audio, WAV; add/remove and rescan | Supported files play, WAV skipped, index updated |
| T05 / F04 | Play/pause, prev at 1s and >3s, next, hold seek, navigate | Correct transport and restart threshold; uninterrupted navigation |
| T06 / F04 | Shuffle songs/albums; Repeat off/one/all at queue end | Tracks preserved and correct end/repeat behaviour |
| T07 / F05 | All library groups, Cover Flow, LT/RU search | Correct groups/order/empty state/accent matching |
| T08 / F06 | Add song/album/artist; save; cancel/confirm clear | Correct queue, cancellation preserves data, save survives restart |
| T09 / F06 | Import all five playlists; edit externally; break one path | Reread changes, retained order, missing entry safe |
| T10 / F07 | Countries/counts, several streams/formats, rapid station changes | Lithuania first with 50; only selected country's stations/transport; latest selection wins |
| T11 / F07,N04 | Drop/restore radio network; play local audio offline | Reconnect/error handled; local audio still works |
| T12 / F08 | Embedded/folder/missing art, double-click, offline | Correct/fallback view, reversible zoom, uninterrupted audio |
| T13 / F09 | EQ Off/preset/Custom extrema on files/radio | Audible change without failure; settings persist |
| T14 / F09 | Sound Check with/without ReplayGain; crossfade long/short/Repeat One | Appropriate leveling/transition and exceptions |
| T15 / F09,F13 | Cap/code, all volume inputs, restart/reset | Application cap holds; code protects change; reset preserves cap |
| T16 / F10 | Close/reopen playing and paused mid-track; radio; missing saved file | Queue/position/state/station restore; missing file handled |
| T17 / F10 | History, replay, clear; 501+ entries | Newest first with time, at most 500, clear persists |
| T18 / F11 | All image formats, subfolders, >12 images, full view, corrupt file | Correct discovery/navigation; failure safe |
| T19 / F11 | Slideshow 2/20s, repeat/shuffle/fade, exit | Settings work; no unwanted timer after exit |
| T20 / F12 | UTF-8/UTF-16/CP1251/CP1257, >512KiB, missing note | Readable supported text; safe size/error handling; unchanged files |
| T21 / F12 | Multiple ICS, recurrence/EXDATE/all-day/month/year edges | Supported events on correct dates; unsupported cases recorded |
| T22 / F13 | All repeat days, beep/playlist, minimize, snooze/dismiss | One firing in awake/running app, 9-minute snooze, visible window |
| T23 / F13 | 12/24h, title clock, cities; timer laps/pause/other menus | Correct time, continuous timer, paused time excluded, log saved |
| T24 / F13 | Lock, wrong/right code, restart locked | Wrong code blocked; restart retains lock; right code opens |
| T25 / F14 | Bricks start/pause/lose; quiz sufficient/small pool; exit | Correct controls/results/small-pool handling; no unwanted audio |
| T26 / F15,N07 | Languages, menus, mouse, clicker, backlight, DPI | Persistent settings, accessible Settings, correct text/hit areas |
| T27 / F16 | Minimize/tray Show/play/next/quit, relaunch, Close | Hidden playback continues; quit/Close end process |
| T28 / F16,N01 | Linux without tray; macOS menu bar; Windows tray | Correct platform behaviour/fallback |
| T29 / N03 | Backup/corrupt/restore JSON in test profile; unwritable directory | Defaults start; write-error handling documented; backup restores |
| T30 / N02 | Large collection, cold/warm start, scan, RAM, navigation/audio | Record sizes/times; usable UI/progress; measured conclusions |
| T31 / N05 | Observe startup/artwork/local/radio traffic | Domains and transmitted fields match privacy description |
| T32 / N08 | Upgrade old version, check settings, uninstall | Appropriate retention/removal and included notices |

For each case record ID, application/source version, OS/CPU, date, PASS/FAIL/BLOCKED/NOT RUN, actual result/evidence and issue ID. Redact paths/history/codes. An unexecuted case is not PASS.

<!-- TEST_RESULTS_START -->
| Check | Windows x64 | Ubuntu 26.04 x64 WSL |
| --- | --- | --- |
| TypeScript | 154 PASS | 154 PASS |
| Rust | 86 PASS (74 unit + 6 format + 6 regression) | 86 PASS |
| Full T01–T32 acceptance | NOT RUN | NOT RUN |

Date: 24 October 2026. macOS test execution has not been recorded. Automated checks are distinct from full manual acceptance.
<!-- TEST_RESULTS_END -->

New input regressions (`input-regression.test.ts`) cover completed/active menu transitions, screen selection/Back during scanning, EQ up/down values and normal list navigation. The new open-artwork tests cover earliest official album selection, exact artist matching, licence rejection, attribution, network failures, bounded requests and access to credit details.

<a id="catalogue"></a>
## 10. Radio catalogue

**Podcasts → country → station → Now Playing**. The main menu labels remain Podcasts / Tinklalaidės / Подкасты.

The catalogue contains **33,936 stations from 218 countries and territories**, including **50 Lithuanian stations**. Lithuania appears first; other countries and their stations are sorted by name. Each country shows its station count.

Next/previous cycles through the selected country's stations only. MENU returns to the station list and then the country list.

The directory is available locally. Listening and open-artwork lookup require internet access. Names and genres are displayed; station logos are not loaded; a song may obtain a verified libre original-album cover. Track metadata depends on the broadcaster; stream addresses and availability can change.

Tests cover grouping, counts, unique identifiers, filtering, sorting and country-scoped transport. Availability of every live stream has not been verified.

<a id="inventory"></a>
## 11. Dependency licence inventory

<!-- LICENSE_INVENTORY_START -->

All locked-version declarations and texts checked. Detailed evidence, hashes and obligations: [register](licenses/inventory.json).

| Ecosystem | Package | Version | Licence |
| --- | --- | --- | --- |
| cargo | adler2 | 2.0.1 | 0BSD OR MIT OR Apache-2.0 |
| cargo | aho-corasick | 1.1.5 | Unlicense OR MIT |
| cargo | alloc-no-stdlib | 3.0.0 | BSD-3-Clause |
| cargo | alloc-stdlib | 0.3.0 | BSD-3-Clause |
| cargo | alsa | 0.9.1 | Apache-2.0/MIT |
| cargo | alsa-sys | 0.3.1 | MIT |
| cargo | android_system_properties | 0.1.6 | MIT OR Apache-2.0 |
| cargo | anyhow | 1.0.104 | MIT OR Apache-2.0 |
| cargo | arrayvec | 0.7.8 | MIT OR Apache-2.0 |
| cargo | atk | 0.18.2 | MIT |
| cargo | atk-sys | 0.18.2 | MIT |
| cargo | atomic-waker | 1.1.2 | Apache-2.0 OR MIT |
| cargo | autocfg | 1.5.1 | Apache-2.0 OR MIT |
| cargo | base64 | 0.21.7 | MIT OR Apache-2.0 |
| cargo | base64 | 0.22.1 | MIT OR Apache-2.0 |
| cargo | base64 | 0.23.1 | MIT OR Apache-2.0 |
| cargo | bit-set | 0.8.0 | Apache-2.0 OR MIT |
| cargo | bit-vec | 0.8.0 | Apache-2.0 OR MIT |
| cargo | bitflags | 1.3.2 | MIT/Apache-2.0 |
| cargo | bitflags | 2.13.2 | MIT OR Apache-2.0 |
| cargo | block-buffer | 0.10.4 | MIT OR Apache-2.0 |
| cargo | block2 | 0.6.2 | MIT |
| cargo | brotli | 9.0.0 | BSD-3-Clause AND MIT |
| cargo | brotli-decompressor | 6.0.1 | BSD-3-Clause/MIT |
| cargo | bs58 | 0.5.1 | MIT/Apache-2.0 |
| cargo | bumpalo | 3.20.3 | MIT OR Apache-2.0 |
| cargo | bytemuck | 1.25.2 | Zlib OR Apache-2.0 OR MIT |
| cargo | byteorder | 1.5.0 | Unlicense OR MIT |
| cargo | byteorder-lite | 0.1.0 | Unlicense OR MIT |
| cargo | bytes | 1.12.1 | MIT |
| cargo | cairo-rs | 0.18.5 | MIT |
| cargo | cairo-sys-rs | 0.18.2 | MIT |
| cargo | camino | 1.2.6 | MIT OR Apache-2.0 |
| cargo | cargo-platform | 0.1.9 | MIT OR Apache-2.0 |
| cargo | cargo_metadata | 0.19.2 | MIT |
| cargo | cargo_toml | 1.0.1 | Apache-2.0 OR MIT |
| cargo | cc | 1.8.0 | MIT OR Apache-2.0 |
| cargo | cesu8 | 1.1.0 | Apache-2.0/MIT |
| cargo | cfb | 0.14.0 | MIT |
| cargo | cfg-expr | 0.15.8 | MIT OR Apache-2.0 |
| cargo | cfg-if | 1.0.5 | MIT OR Apache-2.0 |
| cargo | chrono | 0.4.45 | MIT OR Apache-2.0 |
| cargo | combine | 4.6.9 | MIT |
| cargo | cookie | 0.18.2 | MIT OR Apache-2.0 |
| cargo | core-foundation | 0.10.1 | MIT OR Apache-2.0 |
| cargo | core-foundation-sys | 0.8.7 | MIT OR Apache-2.0 |
| cargo | core-graphics | 0.25.0 | MIT OR Apache-2.0 |
| cargo | core-graphics-types | 0.2.0 | MIT OR Apache-2.0 |
| cargo | core_detect | 1.0.0 | MIT/Apache-2.0 |
| cargo | coreaudio-rs | 0.13.0 | MIT/Apache-2.0 |
| cargo | cpal | 0.16.0 | Apache-2.0 |
| cargo | cpufeatures | 0.2.17 | MIT OR Apache-2.0 |
| cargo | crc32fast | 1.5.2 | MIT OR Apache-2.0 |
| cargo | crossbeam-channel | 0.5.17 | MIT OR Apache-2.0 |
| cargo | crossbeam-deque | 0.8.8 | MIT OR Apache-2.0 |
| cargo | crossbeam-epoch | 0.9.21 | MIT OR Apache-2.0 |
| cargo | crossbeam-utils | 0.8.23 | MIT OR Apache-2.0 |
| cargo | crypto-common | 0.1.7 | MIT OR Apache-2.0 |
| cargo | cssparser | 0.37.0 | MPL-2.0 |
| cargo | cssparser-macros | 0.7.1 | MPL-2.0 |
| cargo | ctor | 1.0.13 | Apache-2.0 OR MIT |
| cargo | darling | 0.24.1 | MIT |
| cargo | darling_core | 0.24.1 | MIT |
| cargo | darling_macro | 0.24.1 | MIT |
| cargo | dasp_sample | 0.11.0 | MIT OR Apache-2.0 |
| cargo | data-encoding | 2.11.1 | MIT |
| cargo | dbus | 0.9.12 | Apache-2.0/MIT |
| cargo | defmt | 1.2.0 | MIT OR Apache-2.0 |
| cargo | defmt-macros | 1.2.0 | MIT OR Apache-2.0 |
| cargo | defmt-parser | 1.1.0 | MIT OR Apache-2.0 |
| cargo | deranged | 0.5.9 | MIT OR Apache-2.0 |
| cargo | derive_more | 2.1.1 | MIT |
| cargo | derive_more-impl | 2.1.1 | MIT |
| cargo | digest | 0.10.7 | MIT OR Apache-2.0 |
| cargo | directories | 6.0.0 | MIT OR Apache-2.0 |
| cargo | dirs | 7.0.0 | MIT OR Apache-2.0 |
| cargo | dirs-sys | 0.5.0 | MIT OR Apache-2.0 |
| cargo | dispatch2 | 0.3.1 | Zlib OR Apache-2.0 OR MIT |
| cargo | displaydoc | 0.2.7 | MIT OR Apache-2.0 |
| cargo | dlopen2 | 0.8.2 | MIT |
| cargo | dlopen2_derive | 0.4.3 | MIT |
| cargo | dom_query | 0.28.0 | MIT |
| cargo | dpi | 0.1.2 | Apache-2.0 AND MIT |
| cargo | dtoa | 1.0.11 | MIT OR Apache-2.0 |
| cargo | dtoa-short | 0.3.5 | MPL-2.0 |
| cargo | dunce | 1.0.5 | CC0-1.0 OR MIT-0 OR Apache-2.0 |
| cargo | dyn-clone | 1.0.20 | MIT OR Apache-2.0 |
| cargo | either | 1.19.0 | MIT OR Apache-2.0 |
| cargo | embed-resource | 3.0.12 | MIT |
| cargo | embed_plist | 1.2.2 | MIT OR Apache-2.0 |
| cargo | encoding_rs | 0.8.42 | (Apache-2.0 OR MIT) AND BSD-3-Clause |
| cargo | equivalent | 1.0.3 | Apache-2.0 OR MIT |
| cargo | erased-serde | 0.4.10 | MIT OR Apache-2.0 |
| cargo | extended | 0.1.0 | MIT |
| cargo | fastrand | 2.5.0 | Apache-2.0 OR MIT |
| cargo | fdeflate | 0.3.7 | MIT OR Apache-2.0 |
| cargo | field-offset | 0.3.6 | MIT OR Apache-2.0 |
| cargo | find-msvc-tools | 0.1.14 | MIT OR Apache-2.0 |
| cargo | flate2 | 1.1.10 | MIT OR Apache-2.0 |
| cargo | fnv | 1.0.7 | Apache-2.0 / MIT |
| cargo | foldhash | 0.2.0 | Zlib |
| cargo | foreign-types | 0.5.0 | MIT/Apache-2.0 |
| cargo | foreign-types-macros | 0.2.4 | MIT/Apache-2.0 |
| cargo | foreign-types-shared | 0.3.1 | MIT/Apache-2.0 |
| cargo | form_urlencoded | 1.2.2 | MIT OR Apache-2.0 |
| cargo | futures-channel | 0.3.34 | MIT OR Apache-2.0 |
| cargo | futures-core | 0.3.34 | MIT OR Apache-2.0 |
| cargo | futures-executor | 0.3.34 | MIT OR Apache-2.0 |
| cargo | futures-io | 0.3.34 | MIT OR Apache-2.0 |
| cargo | futures-macro | 0.3.34 | MIT OR Apache-2.0 |
| cargo | futures-sink | 0.3.34 | MIT OR Apache-2.0 |
| cargo | futures-task | 0.3.34 | MIT OR Apache-2.0 |
| cargo | futures-util | 0.3.34 | MIT OR Apache-2.0 |
| cargo | gdk | 0.18.2 | MIT |
| cargo | gdk-pixbuf | 0.18.5 | MIT |
| cargo | gdk-pixbuf-sys | 0.18.0 | MIT |
| cargo | gdk-sys | 0.18.2 | MIT |
| cargo | gdkwayland-sys | 0.18.2 | MIT |
| cargo | gdkx11 | 0.18.2 | MIT |
| cargo | gdkx11-sys | 0.18.2 | MIT |
| cargo | generic-array | 0.14.7 | MIT |
| cargo | getrandom | 0.2.17 | MIT OR Apache-2.0 |
| cargo | getrandom | 0.3.4 | MIT OR Apache-2.0 |
| cargo | getrandom | 0.4.3 | MIT OR Apache-2.0 |
| cargo | gio | 0.18.4 | MIT |
| cargo | gio-sys | 0.18.1 | MIT |
| cargo | glib | 0.18.5 | MIT |
| cargo | glib-macros | 0.18.5 | MIT |
| cargo | glib-sys | 0.18.1 | MIT |
| cargo | glob | 0.3.4 | MIT OR Apache-2.0 |
| cargo | gobject-sys | 0.18.0 | MIT |
| cargo | gtk | 0.18.2 | MIT |
| cargo | gtk-sys | 0.18.2 | MIT |
| cargo | gtk3-macros | 0.18.2 | MIT |
| cargo | hashbrown | 0.12.3 | MIT OR Apache-2.0 |
| cargo | hashbrown | 0.17.1 | MIT OR Apache-2.0 |
| cargo | heck | 0.4.1 | MIT OR Apache-2.0 |
| cargo | heck | 0.5.0 | MIT OR Apache-2.0 |
| cargo | hex | 0.4.3 | MIT OR Apache-2.0 |
| cargo | html5ever | 0.39.0 | MIT OR Apache-2.0 |
| cargo | http | 1.5.0 | MIT OR Apache-2.0 |
| cargo | http-body | 1.1.0 | MIT |
| cargo | http-body-util | 0.1.5 | MIT |
| cargo | http-range | 0.1.5 | MIT |
| cargo | httparse | 1.10.1 | MIT OR Apache-2.0 |
| cargo | hyper | 1.12.0 | MIT |
| cargo | hyper-util | 0.1.21 | MIT |
| cargo | iana-time-zone | 0.1.65 | MIT OR Apache-2.0 |
| cargo | iana-time-zone-haiku | 0.1.2 | MIT OR Apache-2.0 |
| cargo | ico | 0.5.0 | MIT |
| cargo | icu_collections | 2.3.0 | Unicode-3.0 |
| cargo | icu_locale_core | 2.3.0 | Unicode-3.0 |
| cargo | icu_normalizer | 2.3.0 | Unicode-3.0 |
| cargo | icu_normalizer_data | 2.3.0 | Unicode-3.0 |
| cargo | icu_properties | 2.3.0 | Unicode-3.0 |
| cargo | icu_properties_data | 2.3.0 | Unicode-3.0 |
| cargo | icu_provider | 2.3.1 | Unicode-3.0 |
| cargo | ident_case | 1.0.1 | MIT/Apache-2.0 |
| cargo | idna | 1.1.0 | MIT OR Apache-2.0 |
| cargo | idna_adapter | 1.2.2 | Apache-2.0 OR MIT |
| cargo | image | 0.25.10 | MIT OR Apache-2.0 |
| cargo | indexmap | 1.9.3 | Apache-2.0 OR MIT |
| cargo | indexmap | 2.14.2 | Apache-2.0 OR MIT |
| cargo | infer | 0.22.0 | MIT |
| cargo | ipnet | 2.12.2 | MIT OR Apache-2.0 |
| cargo | itoa | 1.0.18 | MIT OR Apache-2.0 |
| cargo | javascriptcore-rs | 1.1.2 | MIT |
| cargo | javascriptcore-rs-sys | 1.1.1 | MIT |
| cargo | jiff | 0.2.38 | Unlicense OR MIT |
| cargo | jiff-core | 0.1.1 | Unlicense OR MIT |
| cargo | jiff-static | 0.2.38 | Unlicense OR MIT |
| cargo | jiff-tzdb | 0.1.9 | Unlicense OR MIT |
| cargo | jiff-tzdb-platform | 0.1.3 | Unlicense OR MIT |
| cargo | jni | 0.21.1 | MIT/Apache-2.0 |
| cargo | jni-sys | 0.3.1 | MIT OR Apache-2.0 |
| cargo | jni-sys | 0.4.1 | MIT OR Apache-2.0 |
| cargo | jni-sys-macros | 0.4.1 | MIT OR Apache-2.0 |
| cargo | js-sys | 0.3.106 | MIT OR Apache-2.0 |
| cargo | json-patch | 4.2.0 | MIT/Apache-2.0 |
| cargo | jsonptr | 0.7.1 | MIT OR Apache-2.0 |
| cargo | keyboard-types | 0.8.3 | MIT OR Apache-2.0 |
| cargo | lazy_static | 1.5.1 | MIT OR Apache-2.0 |
| cargo | libappindicator | 0.9.0 | Apache-2.0 OR MIT |
| cargo | libappindicator-sys | 0.9.0 | Apache-2.0 OR MIT |
| cargo | libc | 0.2.191 | MIT OR Apache-2.0 |
| cargo | libdbus-sys | 0.2.7 | Apache-2.0/MIT |
| cargo | libloading | 0.7.4 | ISC |
| cargo | libredox | 0.1.25 | MIT |
| cargo | litemap | 0.8.3 | Unicode-3.0 |
| cargo | lock_api | 0.4.14 | MIT OR Apache-2.0 |
| cargo | lofty | 0.22.4 | MIT OR Apache-2.0 |
| cargo | lofty_attr | 0.11.1 | MIT OR Apache-2.0 |
| cargo | log | 0.4.34 | MIT OR Apache-2.0 |
| cargo | mach2 | 0.4.3 | BSD-2-Clause OR MIT OR Apache-2.0 |
| cargo | markup5ever | 0.39.0 | MIT OR Apache-2.0 |
| cargo | memchr | 2.8.3 | Unlicense OR MIT |
| cargo | memoffset | 0.9.1 | MIT |
| cargo | mime | 0.3.17 | MIT OR Apache-2.0 |
| cargo | miniz_oxide | 0.8.9 | MIT OR Zlib OR Apache-2.0 |
| cargo | miniz_oxide | 0.9.1 | MIT OR Zlib OR Apache-2.0 |
| cargo | mio | 1.2.4 | MIT |
| cargo | moxcms | 0.8.1 | BSD-3-Clause OR Apache-2.0 |
| cargo | muda | 0.20.0 | Apache-2.0 OR MIT |
| cargo | multiversion_no_op | 1.0.0 | Apache-2.0 OR MIT |
| cargo | ndk | 0.9.0 | MIT OR Apache-2.0 |
| cargo | ndk-context | 0.1.1 | MIT OR Apache-2.0 |
| cargo | ndk-sys | 0.6.0+11769913 | MIT OR Apache-2.0 |
| cargo | new_debug_unreachable | 1.0.6 | MIT |
| cargo | num-bigint | 0.4.8 | MIT OR Apache-2.0 |
| cargo | num-conv | 0.2.2 | MIT OR Apache-2.0 |
| cargo | num-derive | 0.4.2 | MIT OR Apache-2.0 |
| cargo | num-integer | 0.1.47 | MIT OR Apache-2.0 |
| cargo | num-rational | 0.4.2 | MIT OR Apache-2.0 |
| cargo | num-traits | 0.2.19 | MIT OR Apache-2.0 |
| cargo | num_enum | 0.7.6 | BSD-3-Clause OR MIT OR Apache-2.0 |
| cargo | num_enum_derive | 0.7.6 | BSD-3-Clause OR MIT OR Apache-2.0 |
| cargo | objc2 | 0.6.5 | MIT |
| cargo | objc2-app-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| cargo | objc2-audio-toolbox | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| cargo | objc2-cloud-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| cargo | objc2-core-audio | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| cargo | objc2-core-audio-types | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| cargo | objc2-core-data | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| cargo | objc2-core-foundation | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| cargo | objc2-core-graphics | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| cargo | objc2-core-image | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| cargo | objc2-core-location | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| cargo | objc2-core-text | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| cargo | objc2-encode | 4.1.0 | MIT |
| cargo | objc2-exception-helper | 0.1.1 | Zlib OR Apache-2.0 OR MIT |
| cargo | objc2-foundation | 0.3.2 | MIT |
| cargo | objc2-io-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| cargo | objc2-io-surface | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| cargo | objc2-quartz-core | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| cargo | objc2-ui-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| cargo | objc2-user-notifications | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| cargo | objc2-web-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| cargo | ogg_pager | 0.7.2 | MIT OR Apache-2.0 |
| cargo | once_cell | 1.21.4 | MIT OR Apache-2.0 |
| cargo | option-ext | 0.2.0 | MPL-2.0 |
| cargo | pango | 0.18.3 | MIT |
| cargo | pango-sys | 0.18.0 | MIT |
| cargo | parking_lot | 0.12.5 | MIT OR Apache-2.0 |
| cargo | parking_lot_core | 0.9.12 | MIT OR Apache-2.0 |
| cargo | paste | 1.0.15 | MIT OR Apache-2.0 |
| cargo | percent-encoding | 2.3.2 | MIT OR Apache-2.0 |
| cargo | phf | 0.13.1 | MIT |
| cargo | phf_codegen | 0.13.1 | MIT |
| cargo | phf_generator | 0.13.1 | MIT |
| cargo | phf_macros | 0.13.1 | MIT |
| cargo | phf_shared | 0.13.1 | MIT |
| cargo | pin-project-lite | 0.2.17 | Apache-2.0 OR MIT |
| cargo | pkg-config | 0.3.34 | MIT OR Apache-2.0 |
| cargo | plist | 1.10.1 | MIT |
| cargo | png | 0.17.16 | MIT OR Apache-2.0 |
| cargo | png | 0.18.1 | MIT OR Apache-2.0 |
| cargo | portable-atomic | 1.15.0 | Apache-2.0 OR MIT |
| cargo | portable-atomic-util | 0.2.8 | Apache-2.0 OR MIT |
| cargo | potential_utf | 0.1.6 | Unicode-3.0 |
| cargo | powerfmt | 0.2.1 | MIT OR Apache-2.0 |
| cargo | precomputed-hash | 0.1.1 | MIT |
| cargo | proc-macro-crate | 1.3.1 | MIT OR Apache-2.0 |
| cargo | proc-macro-crate | 2.0.2 | MIT OR Apache-2.0 |
| cargo | proc-macro-crate | 3.5.0 | MIT OR Apache-2.0 |
| cargo | proc-macro-error | 1.0.4 | MIT OR Apache-2.0 |
| cargo | proc-macro-error-attr | 1.0.4 | MIT OR Apache-2.0 |
| cargo | proc-macro2 | 1.0.107 | MIT OR Apache-2.0 |
| cargo | pxfm | 0.1.30 | BSD-3-Clause OR Apache-2.0 |
| cargo | quick-xml | 0.42.0 | MIT |
| cargo | quote | 1.0.47 | MIT OR Apache-2.0 |
| cargo | r-efi | 5.3.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later |
| cargo | r-efi | 6.0.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later |
| cargo | raw-window-handle | 0.6.2 | MIT OR Apache-2.0 OR Zlib |
| cargo | rayon | 1.12.0 | MIT OR Apache-2.0 |
| cargo | rayon-core | 1.13.0 | MIT OR Apache-2.0 |
| cargo | redox_syscall | 0.5.18 | MIT |
| cargo | redox_users | 0.5.3 | MIT |
| cargo | ref-cast | 1.0.27 | MIT OR Apache-2.0 |
| cargo | ref-cast-impl | 1.0.27 | MIT OR Apache-2.0 |
| cargo | regex | 1.13.1 | MIT OR Apache-2.0 |
| cargo | regex-automata | 0.4.18 | MIT OR Apache-2.0 |
| cargo | regex-syntax | 0.8.11 | MIT OR Apache-2.0 |
| cargo | reqwest | 0.13.5 | MIT OR Apache-2.0 |
| cargo | ring | 0.17.14 | Apache-2.0 AND ISC |
| cargo | rodio | 0.21.1 | MIT OR Apache-2.0 |
| cargo | rustc-hash | 2.1.3 | Apache-2.0 OR MIT |
| cargo | rustc_version | 0.4.1 | MIT OR Apache-2.0 |
| cargo | rustls | 0.23.46 | Apache-2.0 OR ISC OR MIT |
| cargo | rustls-pki-types | 1.15.1 | MIT OR Apache-2.0 |
| cargo | rustls-webpki | 0.103.15 | ISC |
| cargo | rustversion | 1.0.23 | MIT OR Apache-2.0 |
| cargo | same-file | 1.0.6 | Unlicense/MIT |
| cargo | schemars | 0.8.22 | MIT |
| cargo | schemars | 0.9.0 | MIT |
| cargo | schemars | 1.2.3 | MIT |
| cargo | schemars_derive | 0.8.22 | MIT |
| cargo | scopeguard | 1.2.0 | MIT OR Apache-2.0 |
| cargo | selectors | 0.38.0 | MPL-2.0 |
| cargo | semver | 1.0.28 | MIT OR Apache-2.0 |
| cargo | serde | 1.0.229 | MIT OR Apache-2.0 |
| cargo | serde-untagged | 0.1.9 | MIT OR Apache-2.0 |
| cargo | serde_core | 1.0.229 | MIT OR Apache-2.0 |
| cargo | serde_derive | 1.0.229 | MIT OR Apache-2.0 |
| cargo | serde_derive_internals | 0.29.1 | MIT OR Apache-2.0 |
| cargo | serde_json | 1.0.154 | MIT OR Apache-2.0 |
| cargo | serde_repr | 0.1.21 | MIT OR Apache-2.0 |
| cargo | serde_spanned | 0.6.9 | MIT OR Apache-2.0 |
| cargo | serde_spanned | 1.1.2 | MIT OR Apache-2.0 |
| cargo | serde_with | 3.24.0 | MIT OR Apache-2.0 |
| cargo | serde_with_macros | 3.24.0 | MIT OR Apache-2.0 |
| cargo | serialize-to-javascript | 0.1.2 | MIT OR Apache-2.0 |
| cargo | serialize-to-javascript-impl | 0.1.2 | MIT OR Apache-2.0 |
| cargo | servo_arc | 0.4.3 | MIT OR Apache-2.0 |
| cargo | sha2 | 0.10.9 | MIT OR Apache-2.0 |
| cargo | shlex | 2.0.1 | MIT OR Apache-2.0 |
| cargo | simd-adler32 | 0.3.10 | MIT |
| cargo | simdutf8 | 0.1.5 | MIT OR Apache-2.0 |
| cargo | siphasher | 1.0.4 | MIT OR Apache-2.0 |
| cargo | slab | 0.4.12 | MIT |
| cargo | smallvec | 1.16.3 | MIT OR Apache-2.0 |
| cargo | socket2 | 0.6.5 | MIT OR Apache-2.0 |
| cargo | softbuffer | 0.4.8 | MIT OR Apache-2.0 |
| cargo | soup3 | 0.5.0 | MIT |
| cargo | soup3-sys | 0.5.0 | MIT |
| cargo | stable_deref_trait | 1.2.1 | MIT OR Apache-2.0 |
| cargo | static_vcruntime | 3.0.0 | MIT OR Apache-2.0 OR Zlib |
| cargo | string_cache | 0.9.0 | MIT OR Apache-2.0 |
| cargo | string_cache_codegen | 0.6.1 | MIT OR Apache-2.0 |
| cargo | strsim | 0.11.1 | MIT |
| cargo | subtle | 2.6.1 | BSD-3-Clause |
| cargo | swift-rs | 1.0.9 | MIT OR Apache-2.0 |
| cargo | symphonia | 0.5.5 | MPL-2.0 |
| cargo | symphonia-bundle-flac | 0.5.5 | MPL-2.0 |
| cargo | symphonia-bundle-mp3 | 0.5.5 | MPL-2.0 |
| cargo | symphonia-codec-aac | 0.5.5 | MPL-2.0 |
| cargo | symphonia-codec-adpcm | 0.5.5 | MPL-2.0 |
| cargo | symphonia-codec-alac | 0.5.5 | MPL-2.0 |
| cargo | symphonia-codec-pcm | 0.5.5 | MPL-2.0 |
| cargo | symphonia-codec-vorbis | 0.5.5 | MPL-2.0 |
| cargo | symphonia-core | 0.5.5 | MPL-2.0 |
| cargo | symphonia-format-caf | 0.5.5 | MPL-2.0 |
| cargo | symphonia-format-isomp4 | 0.5.5 | MPL-2.0 |
| cargo | symphonia-format-mkv | 0.5.5 | MPL-2.0 |
| cargo | symphonia-format-ogg | 0.5.5 | MPL-2.0 |
| cargo | symphonia-format-riff | 0.5.5 | MPL-2.0 |
| cargo | symphonia-metadata | 0.5.5 | MPL-2.0 |
| cargo | symphonia-utils-xiph | 0.5.5 | MPL-2.0 |
| cargo | syn | 1.0.109 | MIT OR Apache-2.0 |
| cargo | syn | 2.0.119 | MIT OR Apache-2.0 |
| cargo | syn | 3.0.9 | MIT OR Apache-2.0 |
| cargo | sync_wrapper | 1.0.2 | Apache-2.0 |
| cargo | synstructure | 0.14.0 | MIT |
| cargo | sysinfo | 0.37.2 | MIT |
| cargo | system-deps | 6.2.2 | MIT OR Apache-2.0 |
| cargo | tao | 0.37.1 | Apache-2.0 |
| cargo | tao-macros | 0.1.4 | MIT OR Apache-2.0 |
| cargo | target-lexicon | 0.12.16 | Apache-2.0 WITH LLVM-exception |
| cargo | tauri | 2.12.4 | Apache-2.0 OR MIT |
| cargo | tauri-build | 2.7.3 | Apache-2.0 OR MIT |
| cargo | tauri-codegen | 2.7.3 | Apache-2.0 OR MIT |
| cargo | tauri-macros | 2.7.3 | Apache-2.0 OR MIT |
| cargo | tauri-runtime | 2.12.2 | Apache-2.0 OR MIT |
| cargo | tauri-runtime-wry | 2.12.2 | Apache-2.0 OR MIT |
| cargo | tauri-utils | 2.10.2 | Apache-2.0 OR MIT |
| cargo | tauri-winres | 0.3.6 | MIT |
| cargo | tendril | 0.5.1 | MIT OR Apache-2.0 |
| cargo | thiserror | 1.0.69 | MIT OR Apache-2.0 |
| cargo | thiserror | 2.0.21 | MIT OR Apache-2.0 |
| cargo | thiserror-impl | 1.0.69 | MIT OR Apache-2.0 |
| cargo | thiserror-impl | 2.0.21 | MIT OR Apache-2.0 |
| cargo | time | 0.3.55 | MIT OR Apache-2.0 |
| cargo | time-core | 0.1.9 | MIT OR Apache-2.0 |
| cargo | time-macros | 0.2.32 | MIT OR Apache-2.0 |
| cargo | tinystr | 0.8.4 | Unicode-3.0 |
| cargo | tinyvec | 1.13.3 | Zlib OR Apache-2.0 OR MIT |
| cargo | tokio | 1.53.3 | MIT |
| cargo | tokio-util | 0.7.20 | MIT |
| cargo | toml | 0.8.2 | MIT OR Apache-2.0 |
| cargo | toml | 1.1.8+spec-1.1.0 | MIT OR Apache-2.0 |
| cargo | toml_datetime | 0.6.3 | MIT OR Apache-2.0 |
| cargo | toml_datetime | 1.1.2+spec-1.1.0 | MIT OR Apache-2.0 |
| cargo | toml_edit | 0.19.15 | MIT OR Apache-2.0 |
| cargo | toml_edit | 0.20.2 | MIT OR Apache-2.0 |
| cargo | toml_edit | 0.25.17+spec-1.1.0 | MIT OR Apache-2.0 |
| cargo | toml_parser | 1.1.5+spec-1.1.0 | MIT OR Apache-2.0 |
| cargo | toml_writer | 1.1.3+spec-1.1.0 | MIT OR Apache-2.0 |
| cargo | tower | 0.5.3 | MIT |
| cargo | tower-http | 0.6.11 | MIT |
| cargo | tower-layer | 0.3.3 | MIT |
| cargo | tower-service | 0.3.3 | MIT |
| cargo | tracing | 0.1.44 | MIT |
| cargo | tracing-core | 0.1.36 | MIT |
| cargo | tray-icon | 0.25.1 | MIT OR Apache-2.0 |
| cargo | try-lock | 0.2.5 | MIT |
| cargo | typeid | 1.0.3 | MIT OR Apache-2.0 |
| cargo | typenum | 1.20.1 | MIT OR Apache-2.0 |
| cargo | unicode-ident | 1.0.27 | (MIT OR Apache-2.0) AND Unicode-3.0 |
| cargo | unicode-segmentation | 1.13.3 | MIT OR Apache-2.0 |
| cargo | untrusted | 0.9.0 | ISC |
| cargo | ureq | 2.12.1 | MIT OR Apache-2.0 |
| cargo | url | 2.5.8 | MIT OR Apache-2.0 |
| cargo | urlpattern | 0.6.0 | MIT |
| cargo | utf8_iter | 1.0.4 | Apache-2.0 OR MIT |
| cargo | uuid | 1.28.0 | Apache-2.0 OR MIT |
| cargo | version-compare | 0.2.1 | MIT |
| cargo | version_check | 0.9.5 | MIT/Apache-2.0 |
| cargo | vswhom | 0.1.0 | MIT |
| cargo | vswhom-sys | 0.1.3 | MIT |
| cargo | walkdir | 2.5.0 | Unlicense/MIT |
| cargo | want | 0.3.2 | MIT |
| cargo | wasi | 0.11.1+wasi-snapshot-preview1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| cargo | wasip2 | 1.0.4+wasi-0.2.12 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| cargo | wasm-bindgen | 0.2.129 | MIT OR Apache-2.0 |
| cargo | wasm-bindgen-futures | 0.4.79 | MIT OR Apache-2.0 |
| cargo | wasm-bindgen-macro | 0.2.129 | MIT OR Apache-2.0 |
| cargo | wasm-bindgen-macro-support | 0.2.129 | MIT OR Apache-2.0 |
| cargo | wasm-bindgen-shared | 0.2.129 | MIT OR Apache-2.0 |
| cargo | wasm-streams | 0.5.0 | MIT OR Apache-2.0 |
| cargo | web-sys | 0.3.106 | MIT OR Apache-2.0 |
| cargo | web-time | 1.1.0 | MIT OR Apache-2.0 |
| cargo | web_atoms | 0.2.6 | MIT OR Apache-2.0 |
| cargo | webkit2gtk | 2.0.2 | MIT |
| cargo | webkit2gtk-sys | 2.0.2 | MIT |
| cargo | webpki-roots | 0.26.11 | CDLA-Permissive-2.0 |
| cargo | webpki-roots | 1.0.9 | CDLA-Permissive-2.0 |
| cargo | webview2-com | 0.39.1 | MIT |
| cargo | webview2-com-macros | 0.8.1 | MIT |
| cargo | webview2-com-sys | 0.39.1 | MIT |
| cargo | winapi | 0.3.9 | MIT/Apache-2.0 |
| cargo | winapi-i686-pc-windows-gnu | 0.4.0 | MIT/Apache-2.0 |
| cargo | winapi-util | 0.1.11 | Unlicense OR MIT |
| cargo | winapi-x86_64-pc-windows-gnu | 0.4.0 | MIT/Apache-2.0 |
| cargo | window-vibrancy | 0.8.1 | Apache-2.0 OR MIT |
| cargo | windows | 0.54.0 | MIT OR Apache-2.0 |
| cargo | windows | 0.61.3 | MIT OR Apache-2.0 |
| cargo | windows | 0.62.2 | MIT OR Apache-2.0 |
| cargo | windows-collections | 0.2.0 | MIT OR Apache-2.0 |
| cargo | windows-collections | 0.3.2 | MIT OR Apache-2.0 |
| cargo | windows-core | 0.54.0 | MIT OR Apache-2.0 |
| cargo | windows-core | 0.61.2 | MIT OR Apache-2.0 |
| cargo | windows-core | 0.62.2 | MIT OR Apache-2.0 |
| cargo | windows-future | 0.2.1 | MIT OR Apache-2.0 |
| cargo | windows-future | 0.3.2 | MIT OR Apache-2.0 |
| cargo | windows-implement | 0.60.2 | MIT OR Apache-2.0 |
| cargo | windows-interface | 0.59.3 | MIT OR Apache-2.0 |
| cargo | windows-link | 0.1.3 | MIT OR Apache-2.0 |
| cargo | windows-link | 0.2.1 | MIT OR Apache-2.0 |
| cargo | windows-numerics | 0.2.0 | MIT OR Apache-2.0 |
| cargo | windows-numerics | 0.3.1 | MIT OR Apache-2.0 |
| cargo | windows-result | 0.1.2 | MIT OR Apache-2.0 |
| cargo | windows-result | 0.3.4 | MIT OR Apache-2.0 |
| cargo | windows-result | 0.4.1 | MIT OR Apache-2.0 |
| cargo | windows-strings | 0.4.2 | MIT OR Apache-2.0 |
| cargo | windows-strings | 0.5.1 | MIT OR Apache-2.0 |
| cargo | windows-sys | 0.45.0 | MIT OR Apache-2.0 |
| cargo | windows-sys | 0.52.0 | MIT OR Apache-2.0 |
| cargo | windows-sys | 0.60.2 | MIT OR Apache-2.0 |
| cargo | windows-sys | 0.61.2 | MIT OR Apache-2.0 |
| cargo | windows-targets | 0.42.2 | MIT OR Apache-2.0 |
| cargo | windows-targets | 0.52.6 | MIT OR Apache-2.0 |
| cargo | windows-targets | 0.53.5 | MIT OR Apache-2.0 |
| cargo | windows-threading | 0.1.0 | MIT OR Apache-2.0 |
| cargo | windows-threading | 0.2.1 | MIT OR Apache-2.0 |
| cargo | windows-version | 0.1.7 | MIT OR Apache-2.0 |
| cargo | windows_aarch64_gnullvm | 0.42.2 | MIT OR Apache-2.0 |
| cargo | windows_aarch64_gnullvm | 0.52.6 | MIT OR Apache-2.0 |
| cargo | windows_aarch64_gnullvm | 0.53.1 | MIT OR Apache-2.0 |
| cargo | windows_aarch64_msvc | 0.42.2 | MIT OR Apache-2.0 |
| cargo | windows_aarch64_msvc | 0.52.6 | MIT OR Apache-2.0 |
| cargo | windows_aarch64_msvc | 0.53.1 | MIT OR Apache-2.0 |
| cargo | windows_i686_gnu | 0.42.2 | MIT OR Apache-2.0 |
| cargo | windows_i686_gnu | 0.52.6 | MIT OR Apache-2.0 |
| cargo | windows_i686_gnu | 0.53.1 | MIT OR Apache-2.0 |
| cargo | windows_i686_gnullvm | 0.52.6 | MIT OR Apache-2.0 |
| cargo | windows_i686_gnullvm | 0.53.1 | MIT OR Apache-2.0 |
| cargo | windows_i686_msvc | 0.42.2 | MIT OR Apache-2.0 |
| cargo | windows_i686_msvc | 0.52.6 | MIT OR Apache-2.0 |
| cargo | windows_i686_msvc | 0.53.1 | MIT OR Apache-2.0 |
| cargo | windows_x86_64_gnu | 0.42.2 | MIT OR Apache-2.0 |
| cargo | windows_x86_64_gnu | 0.52.6 | MIT OR Apache-2.0 |
| cargo | windows_x86_64_gnu | 0.53.1 | MIT OR Apache-2.0 |
| cargo | windows_x86_64_gnullvm | 0.42.2 | MIT OR Apache-2.0 |
| cargo | windows_x86_64_gnullvm | 0.52.6 | MIT OR Apache-2.0 |
| cargo | windows_x86_64_gnullvm | 0.53.1 | MIT OR Apache-2.0 |
| cargo | windows_x86_64_msvc | 0.42.2 | MIT OR Apache-2.0 |
| cargo | windows_x86_64_msvc | 0.52.6 | MIT OR Apache-2.0 |
| cargo | windows_x86_64_msvc | 0.53.1 | MIT OR Apache-2.0 |
| cargo | winnow | 0.5.40 | MIT |
| cargo | winnow | 1.0.4 | MIT |
| cargo | winreg | 0.56.0 | MIT |
| cargo | wit-bindgen | 0.57.1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| cargo | writeable | 0.6.4 | Unicode-3.0 |
| cargo | wry | 0.57.0 | Apache-2.0 OR MIT |
| cargo | x11 | 2.21.0 | MIT |
| cargo | x11-dl | 2.21.0 | MIT |
| cargo | yoke | 0.8.3 | Unicode-3.0 |
| cargo | yoke-derive | 0.8.4 | Unicode-3.0 |
| cargo | zerofrom | 0.1.8 | Unicode-3.0 |
| cargo | zerofrom-derive | 0.1.8 | Unicode-3.0 |
| cargo | zeroize | 1.9.1 | Apache-2.0 OR MIT |
| cargo | zerotrie | 0.2.5 | Unicode-3.0 |
| cargo | zerovec | 0.11.8 | Unicode-3.0 |
| cargo | zerovec-derive | 0.11.6 | Unicode-3.0 |
| cargo | zlib-rs | 0.6.8 | Zlib |
| cargo | zmij | 1.0.23 | MIT |
| npm | @babel/code-frame | 7.29.7 | MIT |
| npm | @babel/compat-data | 7.29.7 | MIT |
| npm | @babel/core | 7.29.7 | MIT |
| npm | @babel/generator | 7.29.8 | MIT |
| npm | @babel/helper-compilation-targets | 7.29.7 | MIT |
| npm | @babel/helper-globals | 7.29.7 | MIT |
| npm | @babel/helper-module-imports | 7.29.7 | MIT |
| npm | @babel/helper-module-transforms | 7.29.7 | MIT |
| npm | @babel/helper-plugin-utils | 7.29.7 | MIT |
| npm | @babel/helper-string-parser | 7.29.7 | MIT |
| npm | @babel/helper-validator-identifier | 7.29.7 | MIT |
| npm | @babel/helper-validator-option | 7.29.7 | MIT |
| npm | @babel/helpers | 7.29.10 | MIT |
| npm | @babel/parser | 7.29.9 | MIT |
| npm | @babel/plugin-transform-react-jsx-self | 7.29.7 | MIT |
| npm | @babel/plugin-transform-react-jsx-source | 7.29.7 | MIT |
| npm | @babel/template | 7.29.7 | MIT |
| npm | @babel/traverse | 7.29.10 | MIT |
| npm | @babel/types | 7.29.8 | MIT |
| npm | @esbuild/aix-ppc64 | 0.25.12 | MIT |
| npm | @esbuild/android-arm | 0.25.12 | MIT |
| npm | @esbuild/android-arm64 | 0.25.12 | MIT |
| npm | @esbuild/android-x64 | 0.25.12 | MIT |
| npm | @esbuild/darwin-arm64 | 0.25.12 | MIT |
| npm | @esbuild/darwin-x64 | 0.25.12 | MIT |
| npm | @esbuild/freebsd-arm64 | 0.25.12 | MIT |
| npm | @esbuild/freebsd-x64 | 0.25.12 | MIT |
| npm | @esbuild/linux-arm | 0.25.12 | MIT |
| npm | @esbuild/linux-arm64 | 0.25.12 | MIT |
| npm | @esbuild/linux-ia32 | 0.25.12 | MIT |
| npm | @esbuild/linux-loong64 | 0.25.12 | MIT |
| npm | @esbuild/linux-mips64el | 0.25.12 | MIT |
| npm | @esbuild/linux-ppc64 | 0.25.12 | MIT |
| npm | @esbuild/linux-riscv64 | 0.25.12 | MIT |
| npm | @esbuild/linux-s390x | 0.25.12 | MIT |
| npm | @esbuild/linux-x64 | 0.25.12 | MIT |
| npm | @esbuild/netbsd-arm64 | 0.25.12 | MIT |
| npm | @esbuild/netbsd-x64 | 0.25.12 | MIT |
| npm | @esbuild/openbsd-arm64 | 0.25.12 | MIT |
| npm | @esbuild/openbsd-x64 | 0.25.12 | MIT |
| npm | @esbuild/openharmony-arm64 | 0.25.12 | MIT |
| npm | @esbuild/sunos-x64 | 0.25.12 | MIT |
| npm | @esbuild/win32-arm64 | 0.25.12 | MIT |
| npm | @esbuild/win32-ia32 | 0.25.12 | MIT |
| npm | @esbuild/win32-x64 | 0.25.12 | MIT |
| npm | @fontsource/inter | 5.3.0 | OFL-1.1 |
| npm | @jridgewell/gen-mapping | 0.3.13 | MIT |
| npm | @jridgewell/remapping | 2.3.5 | MIT |
| npm | @jridgewell/resolve-uri | 3.1.2 | MIT |
| npm | @jridgewell/sourcemap-codec | 1.6.0 | MIT |
| npm | @jridgewell/trace-mapping | 0.3.31 | MIT |
| npm | @napi-rs/lzma-linux-x64-gnu | 1.5.1 | MIT |
| npm | @rolldown/pluginutils | 1.0.0-beta.27 | MIT |
| npm | @rollup/rollup-android-arm-eabi | 4.64.8 | MIT |
| npm | @rollup/rollup-android-arm64 | 4.64.8 | MIT |
| npm | @rollup/rollup-darwin-arm64 | 4.64.8 | MIT |
| npm | @rollup/rollup-darwin-x64 | 4.64.8 | MIT |
| npm | @rollup/rollup-freebsd-arm64 | 4.64.8 | MIT |
| npm | @rollup/rollup-freebsd-x64 | 4.64.8 | MIT |
| npm | @rollup/rollup-linux-arm-gnueabihf | 4.64.8 | MIT |
| npm | @rollup/rollup-linux-arm-musleabihf | 4.64.8 | MIT |
| npm | @rollup/rollup-linux-arm64-gnu | 4.64.8 | MIT |
| npm | @rollup/rollup-linux-arm64-musl | 4.64.8 | MIT |
| npm | @rollup/rollup-linux-loong64-gnu | 4.64.8 | MIT |
| npm | @rollup/rollup-linux-loong64-musl | 4.64.8 | MIT |
| npm | @rollup/rollup-linux-ppc64-gnu | 4.64.8 | MIT |
| npm | @rollup/rollup-linux-ppc64-musl | 4.64.8 | MIT |
| npm | @rollup/rollup-linux-riscv64-gnu | 4.64.8 | MIT |
| npm | @rollup/rollup-linux-riscv64-musl | 4.64.8 | MIT |
| npm | @rollup/rollup-linux-s390x-gnu | 4.64.8 | MIT |
| npm | @rollup/rollup-linux-x64-gnu | 4.64.8 | MIT |
| npm | @rollup/rollup-linux-x64-musl | 4.64.8 | MIT |
| npm | @rollup/rollup-openbsd-x64 | 4.64.8 | MIT |
| npm | @rollup/rollup-openharmony-arm64 | 4.64.8 | MIT |
| npm | @rollup/rollup-win32-arm64-msvc | 4.64.8 | MIT |
| npm | @rollup/rollup-win32-ia32-msvc | 4.64.8 | MIT |
| npm | @rollup/rollup-win32-x64-gnu | 4.64.8 | MIT |
| npm | @rollup/rollup-win32-x64-msvc | 4.64.8 | MIT |
| npm | @tauri-apps/api | 2.12.4 | Apache-2.0 OR MIT |
| npm | @tauri-apps/cli | 2.12.3 | Apache-2.0 OR MIT |
| npm | @tauri-apps/cli-darwin-arm64 | 2.12.3 | Apache-2.0 OR MIT |
| npm | @tauri-apps/cli-darwin-x64 | 2.12.3 | Apache-2.0 OR MIT |
| npm | @tauri-apps/cli-linux-arm-gnueabihf | 2.12.3 | Apache-2.0 OR MIT |
| npm | @tauri-apps/cli-linux-arm64-gnu | 2.12.3 | Apache-2.0 OR MIT |
| npm | @tauri-apps/cli-linux-arm64-musl | 2.12.3 | Apache-2.0 OR MIT |
| npm | @tauri-apps/cli-linux-riscv64-gnu | 2.12.3 | Apache-2.0 OR MIT |
| npm | @tauri-apps/cli-linux-x64-gnu | 2.12.3 | Apache-2.0 OR MIT |
| npm | @tauri-apps/cli-linux-x64-musl | 2.12.3 | Apache-2.0 OR MIT |
| npm | @tauri-apps/cli-win32-arm64-msvc | 2.12.3 | Apache-2.0 OR MIT |
| npm | @tauri-apps/cli-win32-ia32-msvc | 2.12.3 | Apache-2.0 OR MIT |
| npm | @tauri-apps/cli-win32-x64-msvc | 2.12.3 | Apache-2.0 OR MIT |
| npm | @types/babel__core | 7.20.5 | MIT |
| npm | @types/babel__generator | 7.27.0 | MIT |
| npm | @types/babel__template | 7.4.4 | MIT |
| npm | @types/babel__traverse | 7.28.0 | MIT |
| npm | @types/chai | 5.2.3 | MIT |
| npm | @types/deep-eql | 4.0.2 | MIT |
| npm | @types/estree | 1.0.9 | MIT |
| npm | @types/prop-types | 15.7.15 | MIT |
| npm | @types/react | 18.3.31 | MIT |
| npm | @types/react-dom | 18.3.7 | MIT |
| npm | @vitejs/plugin-react | 4.7.0 | MIT |
| npm | @vitest/expect | 3.2.7 | MIT |
| npm | @vitest/mocker | 3.2.7 | MIT |
| npm | @vitest/pretty-format | 3.2.7 | MIT |
| npm | @vitest/runner | 3.2.7 | MIT |
| npm | @vitest/snapshot | 3.2.7 | MIT |
| npm | @vitest/spy | 3.2.7 | MIT |
| npm | @vitest/utils | 3.2.7 | MIT |
| npm | assertion-error | 2.0.1 | MIT |
| npm | baseline-browser-mapping | 2.11.29 | Apache-2.0 |
| npm | browserslist | 4.29.3 | MIT |
| npm | cac | 6.7.14 | MIT |
| npm | caniuse-lite | 1.0.30001816 | CC-BY-4.0 |
| npm | chai | 5.3.3 | MIT |
| npm | check-error | 2.1.3 | MIT |
| npm | convert-source-map | 2.0.0 | MIT |
| npm | csstype | 3.2.3 | MIT |
| npm | debug | 4.4.3 | MIT |
| npm | deep-eql | 5.0.2 | MIT |
| npm | electron-to-chromium | 1.5.459 | ISC |
| npm | es-module-lexer | 1.7.0 | MIT |
| npm | esbuild | 0.25.12 | MIT |
| npm | escalade | 3.2.0 | MIT |
| npm | estree-walker | 3.0.3 | MIT |
| npm | expect-type | 1.4.0 | Apache-2.0 |
| npm | fdir | 6.5.0 | MIT |
| npm | fsevents | 2.3.3 | MIT |
| npm | gensync | 1.0.0-beta.2 | MIT |
| npm | js-tokens | 4.0.0 | MIT |
| npm | js-tokens | 9.0.1 | MIT |
| npm | jsesc | 3.1.0 | MIT |
| npm | json5 | 2.2.3 | MIT |
| npm | loose-envify | 1.4.0 | MIT |
| npm | loupe | 3.2.1 | MIT |
| npm | lru-cache | 5.1.1 | ISC |
| npm | magic-string | 0.30.21 | MIT |
| npm | ms | 2.1.3 | MIT |
| npm | nanoid | 3.3.20 | MIT |
| npm | node-releases | 2.0.59 | MIT |
| npm | pathe | 2.0.3 | MIT |
| npm | pathval | 2.0.1 | MIT |
| npm | picocolors | 1.1.1 | ISC |
| npm | picomatch | 4.0.7 | MIT |
| npm | postcss | 8.5.30 | MIT |
| npm | react | 18.3.1 | MIT |
| npm | react-dom | 18.3.1 | MIT |
| npm | react-refresh | 0.17.0 | MIT |
| npm | rollup | 4.64.8 | MIT |
| npm | scheduler | 0.23.2 | MIT |
| npm | semver | 6.3.1 | ISC |
| npm | siginfo | 2.0.0 | ISC |
| npm | source-map-js | 1.2.2 | BSD-3-Clause |
| npm | stackback | 0.0.2 | MIT |
| npm | std-env | 3.10.0 | MIT |
| npm | strip-literal | 3.1.0 | MIT |
| npm | tinybench | 2.9.0 | MIT |
| npm | tinyexec | 0.3.2 | MIT |
| npm | tinyglobby | 0.2.17 | MIT |
| npm | tinypool | 1.1.1 | MIT |
| npm | tinyrainbow | 2.0.0 | MIT |
| npm | tinyspy | 4.0.6 | MIT |
| npm | typescript | 5.9.3 | Apache-2.0 |
| npm | update-browserslist-db | 1.3.4 | MIT |
| npm | vite | 6.4.4 | MIT |
| npm | vite-node | 3.2.4 | MIT |
| npm | vitest | 3.2.7 | MIT |
| npm | why-is-node-running | 2.3.0 | MIT |
| npm | yallist | 3.1.1 | ISC |

<!-- LICENSE_INVENTORY_END -->

<a id="history"></a>
## 12. Version history

Historical summaries come from earlier README files, not independently verified Git tags.

| Version | Changes |
| --- | --- |
| 1.3.0 | Open-source first-album cover lookup with per-image licence checks, country-based radio, country queue, XSPF, mouse and EQ fixes, local artwork, MIT and dependency notices |
| 1.2 | Depth-rendered chassis, side volume controls, playback resume |
| 1.1 | System tray, hidden playback, automatic alarm window |
| 1.0 | Photos, date/time settings, Bricks, Music Quiz, Legal screen |
| 0.8 | EQ, Sound Check, Crossfade, cap, menus, notes, ICS |
| 0.7 | Alarms and screen lock |
| 0.6 | History, enlarged artwork, world clocks |
| 0.5 | On-The-Go, stopwatch, centre controls |
| 0.4 | Search and playlist import |
| 0.3 | Radio, side volume, Russian |
| 0.2 | Library, playback, Now Playing, artwork |

