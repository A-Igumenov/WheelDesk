# NOTICE — WheelDesk

**English** · [Lietuviškai žemiau](#lietuviškai)

WheelDesk
Copyright (c) 2026 Aleksandr Igumenov (original idea and first author) and WheelDesk contributors.
Licensed under the MIT License — see [LICENSE](LICENSE).

This product includes third-party data and software. Their licences remain with them; the MIT licence
of WheelDesk covers only WheelDesk's own code.

## Data

### World radio station catalogue

- **File:** `crates/core/data/stations.tsv.gz`
- **Obtained from:** <https://github.com/AlonDrilich/radio-playlists> — weekly-rebuilt playlists and
  station data from the [Radio Browser](https://www.radio-browser.info/) community directory of radio
  streams.
- **Licence of the data:** CC0 1.0 Universal (public domain dedication), as stated in that repository
  (`LICENSE-DATA`). The repository's scripts are MIT licensed; WheelDesk does not include them.
- **Changes made by WheelDesk:** entries without an http(s) stream and identical streams removed;
  only broadcasters kept (scoring described in README §7.6); duplicate entries of the same station
  merged with all their stream addresses; converted to a compact tab-separated file by
  `scripts/make-station-catalog.py`; free-form tags mapped to 23 genres at run time.
- **Rights of stations:** station names, logos, trademarks and audio streams remain the property of the
  respective stations. WheelDesk only links to them; logos and audio are not redistributed.
- CC0 requires no attribution; it is given here as a courtesy and for traceability.

### Cover pictures (online, not distributed)

Looked up only when a song or album has no local picture, cached on the user's computer and never
redistributed with WheelDesk:

- MusicBrainz and the Cover Art Archive — <https://musicbrainz.org>, <https://coverartarchive.org>
- TheAudioDB (free public API key) — <https://www.theaudiodb.com>
- Wikipedia (article images) — <https://en.wikipedia.org>

Each source's own terms apply to the pictures.

## Software

| Component | Licence |
|---|---|
| Tauri, `@tauri-apps/api`, `@tauri-apps/cli` | Apache-2.0 OR MIT |
| React, React DOM, Vite, Vitest | MIT |
| TypeScript | Apache-2.0 |
| rodio, cpal, lofty, serde, rayon, ureq, flate2, directories, base64 and most other Rust crates | MIT OR Apache-2.0 |
| Symphonia (audio decoding) | MPL-2.0 — used unmodified; source at <https://github.com/pdeljanov/Symphonia> |
| encoding_rs | (Apache-2.0 OR MIT) AND BSD-3-Clause |
| sysinfo | MIT |
| walkdir | Unlicense OR MIT |
| Inter typeface (`@fontsource/inter`) | SIL Open Font License 1.1 |

The full list of Rust packages and their licences is in `Cargo.lock` (`cargo metadata`); npm packages
are listed in `package-lock.json`. When redistributing binaries, include the licence texts of these
components.

---

## Lietuviškai

WheelDesk – autorių teisės (c) 2026 Aleksandr Igumenov (idėjos autorius ir pirmasis autorius) ir
WheelDesk bendraautoriai. Platinama pagal MIT licenciją – žr. [LICENSE](LICENSE).

**Radijo stočių katalogas** (`crates/core/data/stations.tsv.gz`) paimtas iš
<https://github.com/AlonDrilich/radio-playlists>. Tai kas savaitę atnaujinama bendruomenės katalogo
[Radio Browser](https://www.radio-browser.info/) duomenų kopija. Duomenų licencija – **CC0 1.0**
(perdavimas į viešąją sritį, failas `LICENSE-DATA`); tos saugyklos skriptai – MIT, WheelDesk jų
neįtraukia.

WheelDesk duomenis pakeitė taip:
- pašalino įrašus be srauto ir vienodus srautus;
- paliko tik transliuotojus;
- sujungė tos pačios stoties dublikatus;
- konvertavo skriptu `scripts/make-station-catalog.py`.

Stočių pavadinimai, logotipai, prekių ženklai ir srautai lieka stočių nuosavybė. CC0 nereikalauja
nurodyti šaltinio, tačiau jis nurodomas dėl skaidrumo.

**Viršeliai** (MusicBrainz / Cover Art Archive, TheAudioDB, Wikipedia) ieškomi tik nesant vietinio
viršelio, saugomi naudotojo kompiuteryje ir neplatinami; taikomos kiekvieno šaltinio sąlygos.

**Programinės įrangos komponentų** licencijos pateiktos lentelėje aukščiau.
