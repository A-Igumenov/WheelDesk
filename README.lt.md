# WheelDesk

[English](README.md) · **Lietuvių**

Retro stiliaus muzikos grotuvas su valdymo ratu, skirtas **Windows, Linux ir macOS**. WheelDesk
veikia kaip klasikiniai 2000-ųjų kišeniniai grotuvai – vienas ratas, centrinis mygtukas, įdėtiniai
meniu, *Now Playing* – bet atrodo sąmoningai kitaip: tai savitas kampuotas, aštuonkampis dizainas,
nupieštas kaip mažas įrenginys darbalaukyje.

<p align="center"><img src="docs/images/device-main-menu.png" width="300" alt="WheelDesk pagrindinis meniu darbalaukyje"></p>

| | |
|---|---|
| **Versija** | 1.4.0 |
| **Idėjos autorius ir pirmasis autorius** | Aleksandr Igumenov |
| **Licencija** | [MIT](LICENSE) – laisvai naudoti, mokytis, keisti ir platinti; išsaugoti autorių teisių pranešimą |
| **Technologijos** | Tauri 2 · React 18 · TypeScript · Canvas 2D · Rust (rodio, Symphonia, lofty) |
| **Platformos** | Windows 10/11 x64, Linux x64 (deb, rpm, AppImage), macOS 11+ (Apple Silicon ir Intel) |

---

## Turinys

1. [Apžvalga](#1-apžvalga)
2. [Greita pradžia](#2-greita-pradžia)
3. [Nuo idėjos iki produkto](#3-nuo-idėjos-iki-produkto)
4. [Svarstytos alternatyvos](#4-svarstytos-alternatyvos)
5. [Reikalavimai](#5-reikalavimai)
6. [Architektūra](#6-architektūra)
7. [Pagrindiniai algoritmai](#7-pagrindiniai-algoritmai)
8. [Kompiliavimas ir leidimas](#8-kompiliavimas-ir-leidimas)
9. [Testavimas](#9-testavimas)
10. [Naudotojo vadovas](#10-naudotojo-vadovas)
11. [Privatumas ir tinklo naudojimas](#11-privatumas-ir-tinklo-naudojimas)
12. [Apribojimai ir planai](#12-apribojimai-ir-planai)
13. [Prisidėjimas prie kūrimo](#13-prisidėjimas-prie-kūrimo)
14. [Licencija ir autorystė](#14-licencija-ir-autorystė)

Visi ekrano vaizdai yra aplanke [`docs/images`](docs/images/README.lt.md); ten aprašyta, kur kiekvienas
vaizdas naudojamas ir kaip jį sugeneruoti iš naujo.

---

## 1. Apžvalga

WheelDesk – darbalaukio muzikos grotuvas, kurio **elgsena** atkartoja klasikinį grotuvą su valdymo
ratu:

- visas įrenginys – korpusas, ekranas, ratas ir šoniniai garso mygtukai – piešiamas vienoje drobėje
  (canvas) ir veikia vienodai visose operacinėse sistemose;
- kiekviena funkcija pasiekiama per rato meniu; spustelėjimai pele ant meniu eilučių – pasirinktiniai;
- muzika niekada nesustoja ir nestringa, kol naršote, skenuojate ar keičiate nustatymus.

Ką programa moka:

| Sritis | Svarbiausia |
|---|---|
| **Muzikos biblioteka** | Bet kuris diskas ir aplankas; MP3, M4A/AAC, FLAC, OGG, AIFF; taiso senas Windows koduotes žymėse; atlikėją atspėja iš failo pavadinimo; albumai pagal aplankus |
| **Naršymas** | Cover Flow, Playlists, Artists, Albums, Compilations, Songs, Genres, Composers, Audiobooks, Search |
| **Grojaraščiai** | On-The-Go (laikyti centrinį mygtuką), išsaugoti sąrašai, M3U/M3U8/PLS/XSPF/WPL importas iš kompiuterio |
| **Garsas** | Tikras 10 juostų ekvalaizeris su 22 presetais ir savo kreive, Sound Check (ReplayGain arba išmatuotas garsumas), Audio Crossfade, Volume Limit |
| **Pasaulio radijas** | ~33 700 transliuotojų su filtrais pagal **šalį** ir **žanrą**; ICY dainų pavadinimai bėgančia eilute; dainų viršeliai |
| **Viršeliai** | Įterptas į failą → paveikslėlis aplanke → tik atviri šaltiniai (MusicBrainz / Cover Art Archive, TheAudioDB, Wikipedia) |
| **Extras** | Photos su skaidrėmis, Notes (.txt/.md), Calendars (.ics), Clocks, Alarms, Stopwatch, History, Screen Lock, du žaidimai |
| **Darbalaukis** | Slepiasi dėkle prie laikrodžio, tęsia tiksliai ten, kur sustojo, trys kalbos (EN/LT/RU) |

---

## 2. Greita pradžia

Atsisiųskite savo sistemai skirtą paketą ir įdiekite:

| Sistema | Paketas | Pastabos |
|---|---|---|
| Windows 10/11 | `WheelDesk_<ver>_x64-setup.exe` arba `…_x64-portable.zip` | WebView2 yra Windows 10/11 dalis |
| Linux (Debian/Ubuntu) | `WheelDesk_<ver>_amd64.deb` | Įdiegia WebKitGTK ir AppIndicator |
| Linux (bet kuris) | `WheelDesk_<ver>_amd64.AppImage` | `chmod +x` ir paleisti |
| Linux (Fedora/openSUSE) | `WheelDesk-<ver>-1.x86_64.rpm` | |
| macOS | `.dmg`, sukurtas su `scripts/build-macos.sh` | Pasirašytas „ad hoc“; pirmą kartą: dešinys pelės mygtukas → Open |

Pirmi žingsniai: **Settings → Library Source → diskas → aplankas → Use This Folder**, tada **Music**.

---

## 3. Nuo idėjos iki produkto

### 3.1 Idėja

> *Kompiuterio muzikos grotuvas, kuris jaustųsi lygiai kaip klasikinis grotuvas su valdymo ratu: tie
> patys meniu, tas pats ratas, ta pati logika – bet su savo kampuota išvaizda, kad nebūtų kopijuojamas
> joks dizainas.*

Idėją lydėjo trumpas norų sąrašas, nulėmęs visą projektą:

1. Elgsena kuo artimesnė originalui; visi meniu valdomi ekrano ratu.
2. Licencijų nepažeidžiantis stilius: kampuotas, be originalių pavadinimų, logotipų, piktogramų ir šriftų.
3. Visi šiuolaikiniai muzikos formatai, išskyrus WAV; albumų viršeliai iš viešų šaltinių.
4. Muzikos šaltinis – naudotojo diskai; paskutinis diskas įsimenamas (net jei pasikeičia jo raidė).
5. Galima importuoti grojaraščių failus iš kompiuterio.
6. Tikras, redaguojamas ekvalaizeris su presetais.
7. Vienodai veikia Windows, Linux ir macOS.

Vėlesnėse iteracijose atsirado internetinis radijas (iš pradžių fm.lt, vėliau pasaulio katalogas),
šoniniai garso mygtukai, rusų ir lietuvių kalbos, valdymas pele, darbas dėkle, tęsimas po paleidimo iš
naujo, erdvinis vaizdas ir pilni *Extras* bei *Settings* meniu.

### 3.2 Tikslai ir ne tikslai

| Tikslai | Ne tikslai |
|---|---|
| Tikslus *valdymas*: ratas, centras, MENU, ⏮ ⏭ ⏯, laikymas On-The-Go | Pikselis į pikselį nukopijuotas įrenginys, jo šriftai ar piktogramos |
| Vienas kodas, vienoda elgsena trijose OS | Kiekvienai platformai atskiri UI įrankiai |
| Visiškai veikia be interneto su vietine muzika | Srautinių paslaugų paskyros, DRM, sinchronizavimas debesyje |
| Tik atviri duomenys (viršeliai, radijas) | Parduotuvių ar mokami katalogai (iTunes, Deezer, Spotify …) |
| Nedidelis, aiškus kodas, kurį gali nagrinėti studentai | Įskiepių sistema ar apvalkalai |

### 3.3 Projektavimo principai

- **Pirmiausia elgsena.** Kiekvienas meniu buvo „atvirkštinės inžinerijos“ būdu išanalizuotas – ką
  daro originalas – ir sukurtas kaip sava versija. Nerealizuoti punktai buvo rodomi pilkai, kol jų
  neįgyvendinome (po du per iteraciją).
- **Niekada nepertraukti muzikos.** Garsas groja atskiroje gijoje; internetinių srautų dekodavimas –
  dar kitoje gijoje su žiediniu buferiu, todėl lėtas tinklas niekada neužblokuoja failų ar sąsajos.
- **Gryna logika, plonas apvalkalas.** Meniu logika (`src/core`) neturi nei DOM, nei Tauri; nuo OS
  priklausantis kodas yra Rust branduolyje (`crates/core`); Tauri sluoksnis tik pateikia komandas.
- **Pirmiausia be interneto, atviri duomenys.** Radijo katalogas įdėtas į programą; viršeliai imami tik
  iš atvirų, nemokamų šaltinių ir išsaugomi.
- **Prisiminti viską.** Nustatymai, bibliotekos indeksas, paskutinis diskas, vieta eilėje ir paskutinė
  stotis išlieka po paleidimo iš naujo.

### 3.4 Kūrimo procesas

Projektas kurtas trumpais ciklais; kiekvienas baigdavosi sukompiliuotais Windows ir Linux paketais:

```text
idėja ─► planas ─► karkasas (ratas + meniu drobėje) ─► biblioteka + grojimas ─► viršeliai
      ─► radijas ─► Extras / Settings po 2 punktus per ciklą (pilki, kol nebaigti) ─► pilnas meniu (v1.0)
      ─► dėklas, erdvinis vaizdas, tęsimas (v1.1–1.2) ─► pasaulio radijas + atviri viršeliai (v1.3–1.4)
```

Kiekvienas ciklas: įgyvendinti → moduliniai testai → tikros sąsajos ekrano vaizdai naršyklės
peržiūroje → Windows (kryžminis kompiliavimas iš Linux) ir Linux paketai → bandomasis paleidimas
virtualiame ekrane.

---

## 4. Svarstytos alternatyvos

Kiekvienas sprendimas užrašytas kaip trumpas sprendimo įrašas: variantai, pasirinkimas ir priežastis.

| # | Sprendimas | Svarstyti variantai | Pasirinkta | Kodėl |
|---|---|---|---|---|
| D1 | Darbalaukio karkasas | Electron · **Tauri 2** · Qt/QML · Flutter · natūralus kiekvienai OS | **Tauri 2** | Maži diegikliai (~5–10 MB, ne ~80 MB), Rust garsui ir failams, ta pati web sąsaja visose OS; toks pat stekas kaip autoriaus MiotDesk/AqDesk |
| D2 | Įrenginio piešimas | DOM/CSS · SVG · **Canvas 2D** · WebGL | **Canvas 2D** | Pikselis į pikselį vienodai WebView2, WebKit ir WebKitGTK; tikslus rato paspaudimų nustatymas; pigios animacijos. Kaina: prieinamumas ir teksto išdėstymas daromi rankomis |
| D3 | Sąsajos logika | React būsena visur · **paprasta TypeScript būsenų mašina** + plonas React apvalkalas | **Būsenų mašina** (`Navigator`) | Testuojama be naršyklės; ekranai yra duomenys (`Screen` objektai) |
| D4 | Garso variklis | HTML `<audio>`/WebAudio · GStreamer · VLC · **rodio + cpal + Symphonia** | **rodio/Symphonia** | Grynas Rust, nereikia sistemos kodekų, be pauzių tarp dainų, DSP tame pačiame procese; WebView garsas skiriasi pagal OS ir jo patikimai apdoroti negalima |
| D5 | Žymės | TagLib (C++) · **lofty** | **lofty** | Grynas Rust, skaito ID3, MP4, Vorbis, FLAC, AIFF |
| D6 | Nustatymų ir indekso saugojimas | SQLite · **JSON failai** | **JSON** | Skaitomi žmogui, maži, be migracijų; bibliotekos indeksas yra podėlis, kurį galima atkurti |
| D7 | Albumų viršeliai | iTunes · Deezer · Last.fm · Discogs · **MusicBrainz/CAA + TheAudioDB + Wikipedia** | **Tik atviri šaltiniai** | Jokių mokamų ar parduotuvių API, jokių saugotinų raktų; bendruomenės duomenys |
| D8 | Radijo katalogas | fm.lt nuskaitymas · gyvas Radio Browser API · **įdėta Radio Browser kopija** ([radio-playlists](https://github.com/AlonDrilich/radio-playlists), CC0) | **Įdėtas** (nuo v1.3) | Veikia be interneto, akimirksniu filtruoja, neapkrauna API; atnaujinamas skriptu |
| D9 | Kurios stotys | Visi 69 781 įrašai · **tik transliuotojai** | **Transliuotojai** | Oficialumo požymių vertinimas + dublikatų sujungimas (§7.6) |
| D10 | Disko atpažinimas | Disko raidė / prijungimo kelias · **tomo GUID / failų sistemos UUID** | **Pastovus tomo ID** | Paskutinis diskas randamas ir pasikeitus raidei ar prijungimo vietai |
| D11 | Erdvinis vaizdas | Tikra izometrija · **įstrižinė (kabineto) projekcija** | **Įstrižinė** | Priekis (ekranas, ratas) lieka neiškraipytas ir spaudžiamas kaip anksčiau; pridedamos tik briaunos |
| D12 | Windows paketai | Tik Windows kompiuteris/CI · **kryžminis kompiliavimas iš Linux** (MinGW + NSIS) | **Abu** | Paketus galima sukurti viename Linux kompiuteryje; CI kuria natūralius |
| D13 | Licencija | GPL · Apache-2.0 · **MIT** | **MIT** | Trumpiausia leidžianti licencija, suderinama su visomis priklausomybėmis (§14) |

---

## 5. Reikalavimai

### 5.1 Funkciniai reikalavimai

| ID | Reikalavimas | Priėmimo kriterijus |
|---|---|---|
| FR-01 | Visi meniu valdomi ratu | 15° pasukimas – viena eilutė; centras – pasirinkti; viršus – MENU; kairė/dešinė – ⏮ ⏭; apačia – ⏯ |
| FR-02 | Centrinė vairalazdė | Aukštyn/žemyn – judėti, kairė – MENU, dešinė – atidaryti, vidurys – groti/pauzė; laikyti 0,7 s – į On-The-Go |
| FR-03 | Biblioteka iš bet kurio disko | Diskas atpažįstamas pagal GUID/UUID; po paleidimo iš naujo ar raidės pasikeitimo randamas tas pats aplankas |
| FR-04 | Formatai | MP3, M4A/AAC, FLAC, OGG, AIFF skenuojami ir groja; WAV praleidžiamas |
| FR-05 | Teksto taisymas | Windows-1251/1257 arba dvigubai užkoduotos UTF-8 žymės rodomos teisingai |
| FR-06 | Albumai pagal aplankus | Vienas albumas aplankui; dainos be žymių prijungiamos prie aplanko albumo; skirtingos žymės → aplanko pavadinimas |
| FR-07 | Naršymas | Cover Flow, Artists, Albums, Compilations, Songs, Genres, Composers, Audiobooks, Search |
| FR-08 | Grojaraščiai | On-The-Go, išsaugoti/išvalyti, M3U/M3U8/PLS/XSPF/WPL importas, trūkstami failai parodomi |
| FR-09 | Grojimas | Eilė, ⏮ po 3 s grąžina į pradžią, laikant ⏮ ⏭ – persukimas, Shuffle dainos/albumai, Repeat viena/visos |
| FR-10 | Neblokuojanti sąsaja | Naršymas, skenavimas ir nustatymai niekada nestabdo ir netrikdo muzikos |
| FR-11 | Viršeliai | Įterptas → aplanke → atviri šaltiniai; talpinami; nerasti bandomi vėl po 7 d. (dainų – po 1 d.) |
| FR-12 | Ekvalaizeris | 10 juostų ±12 dB, 22 presetai + Custom, taikoma grojant failams ir radijui |
| FR-13 | Sound Check / Crossfade / Volume Limit | Garsumo suvienodinimas; 6 s vienodos galios perėjimas; garso riba su nebūtinu 4 skaitmenų kodu |
| FR-14 | Pasaulio radijas | Filtras pagal šalį ir žanrą; ⏮ ⏭ lieka filtruotame sąraše; neveikiant – kiti stoties srautai |
| FR-15 | Extras | Photos, Notes, Calendars, Clocks, Alarms, Stopwatch, History, Screen Lock, Games |
| FR-16 | Nustatymai | Main Menu / Music Menu redagavimas, Backlight, Clicker, Mouse Control, Date & Time, Language, Library Source, Legal, Reset |
| FR-17 | Dėklas | Minimize paslepia į dėklą; spustelėjus dėkle – parodo; Close visiškai uždaro |
| FR-18 | Tęsimas | Po paleidimo iš naujo tęsiama ta pati eilė/daina/vieta (arba stotis) |
| FR-19 | Kalbos | Anglų, lietuvių, rusų; kirilica ir lietuviškos raidės įdėtame šrifte |

### 5.2 Nefunkciniai reikalavimai

| ID | Reikalavimas | Kaip įgyvendinta |
|---|---|---|
| NFR-01 | Vienoda išvaizda ir elgsena Windows, Linux, macOS | Viena drobė, įdėtas Inter šriftas, logika TS/Rust be OS šakų |
| NFR-02 | Greitas atsakas | Garso gija + dekodavimo gija + žiedinis buferis; skenavimas Rayon telkinyje (branduoliai − 1) |
| NFR-03 | Paleidimas | Biblioteka rodoma iš karto iš išsaugoto indekso; pasikeitę failai perskenuojami fone |
| NFR-04 | Patikimumas | Dekoderio klaidos sugaunamos; neperskaitomi failai praleidžiami; srautai jungiasi iš naujo iki 5 kartų |
| NFR-05 | Be interneto | Vietinė muzika, radijo katalogas, užrašai, kalendoriai, nuotraukos veikia be interneto |
| NFR-06 | Dydis | Diegiklis ≈ 9–10 MB (Windows), radijo katalogas 3 MB suspaustas |
| NFR-07 | Licencijos | Tik leidžiančios arba failų lygio copyleft priklausomybės; atviri duomenų šaltiniai |
| NFR-08 | Testuojamumas | Meniu logika, DSP, katalogas, analizatoriai padengti automatiniais testais (§9) |

### 5.3 Apribojimai

- Licencijų nepažeidžiantis vaizdas: jokių originalių pavadinimų, logotipų, piktogramų ar šriftų.
- Langas be rėmelio ir permatomas; įrenginys pats piešia lango mygtukus.
- Rust branduolys negali priklausyti nuo Tauri (jį naudoja ir pavyzdžiai, ir testai).

---

## 6. Architektūra

### 6.1 Sluoksniai

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  WebView (WebView2 / WebKit / WebKitGTK)                                     │
│  ┌──────────────────────────┐   ┌──────────────────────────────────────────┐ │
│  │ src/render  (Canvas 2D)  │◄──│ src/core   (grynas TypeScript, be DOM)   │ │
│  │ įrenginys · ekranas      │   │ Navigator · meniu · Library · Playback   │ │
│  │ rato paspaudimai, įvestis│──►│ paieška · eq · ics · žadintuvai · žaid.  │ │
│  └──────────────────────────┘   └───────────────────┬──────────────────────┘ │
│                 App.tsx (sujungimas, laikmačiai,    │                        │
│                          tęsimas)                   │                        │
│                 src/platform/bridge.ts ─────────────┘  (invoke / listen,     │
│                                                         naršyklės demo)      │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ Tauri IPC: 25 komandos, 3 įvykiai
┌───────────────────────────────▼──────────────────────────────────────────────┐
│  src-tauri  (plonas apvalkalas: komandos, langas, dėklas, asset protokolas)  │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ paprasti Rust kvietimai
┌───────────────────────────────▼──────────────────────────────────────────────┐
│  crates/core  (wheeldesk-core, be Tauri)                                     │
│  volumes · settings · library · text · playlists · docs                      │
│  player ─► dsp ─► rodio/cpal ─► garso įrenginys                              │
│  stream (ICY, grojaraščiai, HLS) · catalog · radio · covers · art            │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Modulių žemėlapis

**Sąsaja (`src/`)**

| Modulis | Atsakomybė |
|---|---|
| `core/navigator.ts` | Meniu būsenų mašina: vaizdų dėklas, sukimas/pasirinkimas/atgal/laikymas, savi ekranai, pelės eilutės |
| `core/menus.ts` | Visi įrenginio ekranai, sukurti iš `MenuContext` (duomenys + veiksmai) |
| `core/library.ts` | Bibliotekos indeksai: atlikėjai, albumai, rinkiniai, žanrai, kompozitoriai, rūšiavimo raktai |
| `core/playback.ts` | Grojimo vaizdas sąsajoje: eilė, radijo sąrašas ir filtras, tęsimas, garso riba |
| `core/search.ts` · `eq.ts` · `ics.ts` · `alarms.ts` · `clocks.ts` · `stopwatch.ts` · `timefmt.ts` | Paieškos normalizavimas, EQ kreivės, iCalendar analizatorius, žadintuvų laikas, pasaulio laikrodžiai, laikmatis, 12/24 val. |
| `core/games/` | Plytų fizika, muzikos viktorinos raundai |
| `core/strings.ts` | Visi sąsajos tekstai anglų, lietuvių, rusų kalbomis |
| `core/wheel.ts` | Rato matematika: kampas → žingsniai (15° eilutei), pagreitis ilguose sąrašuose |
| `render/device.ts` | Korpusas (įstrižinė projekcija), ratas, šoniniai mygtukai, įvestis, vairalazdė, animacijos ciklas |
| `render/screen.ts` | Antraštė, eilutės, slinkties juosta, perėjimai, laikas antraštėje |
| `render/*.ts` | Now Playing, Cover Flow, paieška, EQ, parinkikliai, kalendorius, nuotraukos, žaidimai, tekstas … |
| `platform/bridge.ts` | Vienintelė vieta, kalbanti su Rust; paprastoje naršyklėje pateikia demonstracinius duomenis |
| `App.tsx` | Sujungimas: nustatymai, bibliotekos įkėlimas, grotuvo įvykiai, istorija, žadintuvai, tęsimas, išėjimas iš dėklo |

**Rust branduolys (`crates/core/src/`)**

| Modulis | Atsakomybė |
|---|---|
| `volumes.rs` | Diskų sąrašas su pastoviais ID (Windows GUID, Linux/macOS UUID, atsarginis `mnt:`) |
| `settings.rs` | `settings.json` OS nustatymų aplanke; nežinomi sąsajos laukai išsaugomi |
| `library.rs` | Lygiagretus skenavimas, žymių skaitymas, spėjimas iš failo vardo, aplankų albumai, indekso podėlis |
| `text.rs` | Senų koduočių taisymas (1251, 1257, klaidingai dekoduotas UTF-8) |
| `playlists.rs` | M3U/PLS/XSPF/WPL analizė ir kelių nustatymas |
| `player.rs` | Grotuvo gija, eilės taisyklės, srautai, Sound Check, crossfade |
| `dsp.rs` | 10 juostų biquad ekvalaizeris, lygio glotninimas, garsumo analizė |
| `stream.rs` | HTTP/ICY srautai, grojaraščiai (.pls/.m3u/.xspf/.asx), HLS + MPEG-TS išskaidymas, gyvas žiedinis buferis |
| `catalog.rs` | Įdėtas pasaulio stočių katalogas, žanrų priskyrimas, filtrai |
| `covers.rs` · `art.rs` | Atviri viršelių šaltiniai; įterpti/aplanko viršeliai; disko podėlis |
| `radio.rs` | Dainų viršelių paieška radijo pavadinimams (ir senas fm.lt sąrašas) |
| `docs.rs` | Tekstiniai failai (užrašai, kalendoriai) bet kokia koduote; aplankų sąrašai; nuotraukų paieška |

### 6.3 Modulių sąveika

```text
 pelė / klavišai                                                 OS garso įrenginys
      │                                                                ▲
      ▼                                                                │
┌───────────┐ sukti/rinkt/atgal  ┌───────────┐  veiksmai  ┌──────────┐ │
│ device.ts │───────────────────►│ Navigator │───────────►│ menus.ts │ │
│ (įvestis) │◄──── perpiešti ────│  (dėklas) │◄─ Screen ──│ ekranai  │ │
└─────┬─────┘                    └───────────┘            └────┬─────┘ │
      │ draw(screen)                                          │ ctx.*  │
      ▼                                                       ▼        │
┌───────────┐                  ┌────────────┐ groti/persuk┌──────────┐ │
│ screen.ts │                  │ App.tsx    │◄────────────│ Playback │ │
│ vaizdai   │                  │ (jungimas) │────────────►│ Library  │ │
└───────────┘                  └─────┬──────┘   būsena    └────┬─────┘ │
                                     │ bridge.ts                │      │
                     invoke ─────────┼──────────── listen ──────┘      │
                                     ▼                                 │
                ┌──────────────── src-tauri ─────────────────┐         │
                │ komandos: biblioteka·grotuv.·radijas·failai│         │
                └───┬─────────┬──────────┬──────────┬────────┘         │
                    ▼         ▼          ▼          ▼                  │
               library.rs  player.rs  catalog.rs  covers.rs            │
                    │         │  │         │          │                │
                    ▼         │  └► stream.rs ─► internetinis radijas  │
               failų sistema  └──► dsp.rs ─► rodio/cpal ───────────────┘
```

### 6.4 Sekų diagramos

**Paleidimas ir tęsimas**

```text
App            bridge/Tauri          core                    Sąsaja
 │ get_settings ─────►│ settings.json ──►│
 │◄──────── Settings ─┤                  │
 │ resolve_library_source(volumeId) ────►│ disko paieška pagal GUID/UUID
 │ library_cached(root) ────────────────►│ library-cache.json
 │ Library(podėlis) ─────────────────────────────────────────► rodomas pagrindinis meniu
 │ settings.resume? ── dainos: restore(eilė, indeksas, vieta, groja) ─► Now Playing
 │                  └─ radijas: radio_catalog(filtras) → playStation
 │ scan_library(root) ──────────────────►│ rayon skenavimas, „scan-progress“ įvykiai
 │◄──────────────────────── dainos ──────┤
 │ Library(nauja) ───────────────────────────────────────────► perpiešti
```

**Dainos grojimas**

```text
menus      Playback        bridge      grotuvo gija           dsp/rodio
  │ daina ─────►│ playerLoad(eilė) ───►│ start(i): open_decoder
  │             │                      │ Sound Check lygis (žymė | išmatuota)
  │             │                      │ Sink ◄─ Dsp(dekoderis, eq, lygis) ──► garsas
  │             │◄── „player-state“ ───┤ kas 250 ms: vieta, indeksas, groja
  │◄─ perpiešti─┤                      │ paskutinės 6 s ir crossfade → kita daina, abi slopinamos
```

**Radijo stotis su atsarginiais srautais**

```text
menus          Playback               grotuvo gija              stream.rs
 │ stotis ───►│ playerLoad({path, alternates})
 │            │                       │ gija: for url in [path, alternates…]
 │            │                       │   open_live(url) ───────► HTTP GET (Icy-MetaData)
 │            │                       │                           .pls/.m3u/.xspf/.asx → sekti
 │            │                       │                           HLS → segmentai, TS → ADTS
 │            │                       │◄── Ok(Live) / Err ────────┤ dekodavimo gija → žiedinis buferis
 │            │                       │ laimi pirmas Ok; visi Err → „Cannot connect“
 │◄── „player-state“ (buferizuojama → groja, streamTitle) ┤
```

**Viršelio paieška**

```text
ArtStore (sąsaja) ── get_art(daina) ──► art.rs
   1 failo viduje įterptas paveikslėlis ─────────────────────────► rasta? baigta
   2 cover.jpg / folder.jpg / front.png … aplanke ───────────────► rasta? baigta
   3 disko podėlis artwork/<maiša>.img (yra) | .none (nėra, < 7 d.) ► baigta
   4 covers::album():
        MusicBrainz release-group paieška (1 užkl./s) → Cover Art Archive front-500
        TheAudioDB searchalbum.php → strAlbumThumb
        Wikipedia paieška → straipsnio paveikslėlis (straipsnis turi būti apie to atlikėjo albumą)
   5 išsaugoti .img arba .none
```

### 6.5 Navigatoriaus būsenų mašina

```text
             pasirinkti (item.open)          pasirinkti (item.run + closeAfter)
   ┌────────┐ ───────────────► ┌──────────┐ ────────────────────────────► vienu lygiu atgal
   │ Ekranas│                  │ Ekranas+1│
   └────────┘ ◄─────────────── └──────────┘
             atgal (MENU)       │  ▲
                                │  │ savi ekranai: onRotate / onSelect / onButton /
                                ▼  │ onText / onClick / draw / upIsMore / transient
                         modaliniai ekranai (užraktas, žadintuvas) perima MENU ir mygtukus
```

`Screen` – paprasti duomenys: `id`, `title`, `items()` (sukuriami kaskart skaitant, todėl reikšmės
visada aktualios), nebūtinas `draw()` saviems vaizdams ir kabliukai ratui, mygtukams, tekstui ir pelei.
Parinkikliai su žyme `transient` užsidaro kartu su ekranu, kuris juos baigia.

### 6.6 Garso grandinė

```text
 failas ─► Symphonia dekoderis ─┐
                                ├─► Dsp ─────────────────────► rodio Sink ─► maišiklis ─► cpal ─► įrenginys
 radijas ─► stream.rs ─► Live   │    ├ lygis (Sound Check / perėjimai, glotninama ~50 ms)
           (dekodavimo gija,    │    ├ išankstinis slopinimas (atsarga EQ kėlimams)
            žiedinis buferis,   │    ├ 10 × smailinis biquad kiekvienam kanalui (32 Hz … 16 kHz)
            tyla, kai trūksta)──┘    └ švelnus ribojimas virš 0,8
 Garsumas: suvokimo kreivė v² Sink'e · Crossfade: du Sink'ai su vienodos galios lygiais
```

### 6.7 IPC sutartis (Tauri)

| Komanda | Paskirtis |
|---|---|
| `get_settings`, `save_settings` | Skaityti/rašyti `settings.json` |
| `list_volumes`, `resolve_library_source`, `list_dirs` | Diskai ir aplankai |
| `library_cached`, `scan_library` | Išsaugotas indeksas; pilnas skenavimas (siunčia `scan-progress`) |
| `get_art`, `song_cover` | Albumo viršelis (data URL); radijo dainos viršelio URL |
| `player_load`, `player_cmd` | Eilė; `toggle pause next prev stop seekTo seekBy volume repeat eq soundcheck crossfade` |
| `radio_countries`, `radio_genres`, `radio_catalog`, `radio_station` | Pasaulio katalogo filtrai ir paieška |
| `radio_stations`, `radio_resolve` | Senas fm.lt sąrašas (paliktas suderinamumui) |
| `list_playlist_dir`, `read_playlist` | Grojaraščių importas |
| `list_files`, `find_files`, `read_text` | Užrašai, kalendoriai, nuotraukos |
| `hide_to_tray`, `show_window`, `quit_app` | Langas ir dėklas |

| Įvykis | Turinys |
|---|---|
| `player-state` | `playing, index, queueLen, positionMs, durationMs, volume, path, error, buffering, streamTitle` |
| `scan-progress` | `root, done, total` |
| `app-quit` | Dėklo *Išeiti*: sąsaja išsaugo vietą, tada programa užsidaro (1,5 s riba) |

### 6.8 Duomenų modelis (pagrindiniai tipai)

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

### 6.9 Failai diske

| Kas | Windows | Linux | macOS |
|---|---|---|---|
| Nustatymai `settings.json` | `%APPDATA%\Igumenov\WheelDesk\config\` | `~/.config/wheeldesk/` | `~/Library/Application Support/lt.Igumenov.WheelDesk/` |
| Podėlis: `library-cache.json`, `artwork/`, `radio-covers/` | `%LOCALAPPDATA%\Igumenov\WheelDesk\cache\` | `~/.cache/wheeldesk/` | `~/Library/Caches/lt.Igumenov.WheelDesk/` |

Podėlį galima ištrinti bet kada – jis sukuriamas iš naujo.

### 6.10 Saugyklos struktūra

```text
WheelDesk/
├─ src/                    React + TypeScript sąsaja
│  ├─ core/                gryna logika (meniu, navigatorius, biblioteka, grojimas, žaidimai …) + testai
│  ├─ render/              piešimas drobėje (įrenginys, ekranas, vaizdai)
│  ├─ platform/bridge.ts   tiltas į Rust + naršyklės demo duomenys
│  └─ App.tsx, main.tsx
├─ src-tauri/              Tauri apvalkalas (komandos, dėklas, langas, konfigūracija, piktogramos)
├─ crates/core/            Rust branduolio biblioteka
│  ├─ src/                 moduliai iš §6.2
│  ├─ data/stations.tsv.gz įdėtas radijo katalogas
│  ├─ examples/            volumes, decode, play, radio, switch, catalog
│  └─ tests/               formatų pavyzdžiai ir integraciniai testai
├─ scripts/                kompiliavimo skriptai, katalogo kūrimas, ekrano vaizdų fiksavimas
├─ docs/images/            dokumentacijos ekrano vaizdai
├─ .github/workflows/ci.yml
├─ LICENSE · NOTICE.md · README.md · README.lt.md
```

---

## 7. Pagrindiniai algoritmai

### 7.1 Ratas

Žymeklio kampas apie rato centrą sekamas nuolat; kas **15°** pasukimo – vienas žingsnis sąraše (24 per
apsisukimą). Liekana išsaugoma, todėl lėtas sukimas niekada neprarandamas. Sąrašuose, ilgesniuose nei
50 eilučių, greitesni nei 45 ms žingsniai pagreitinami. Judesys, mažesnis nei 6°, – paspaudimas, ne
sukimas. Centras yra vairalazdė: 17 px šerdis – groti/pauzė, keturi kraštai – aukštyn/žemyn/MENU/atidaryti.

### 7.2 Teksto taisymas

Senų Windows programų įrašytos žymės dažnai būna Windows-1251 (kirilica) ar 1257 (Baltijos) koduote
arba dukart dekoduotas UTF-8. `text.rs` pirmiausia tikrina, ar tai galiojantis UTF-8, tada ieško
„mojibake“ šablonų (pvz., `РњРђ…` ar `Ã…`), 1251 raidžių sekų mišriuose pavadinimuose ir 1257 žymių,
ir dekoduoja ta koduote, kuri duoda tikras raides. ICY srautų pavadinimams taikoma ta pati logika.

### 7.3 Albumai pagal aplankus

Po skenavimo tikrinamas kiekvienas aplankas (`CD1`/`Disc 2` poaplankiai jungiami prie tėvinio): viena
bendra albumo žymė → ją gauna visos dainos, net ir be žymių; skirtingos arba jokios žymės → albumas
pavadinamas aplanko vardu. Skirtingi atlikėjai viename aplanke tampa *Various Artists* ir rinkiniu.
Trūkstami atlikėjai ir numeriai atspėjami iš pavadinimų kaip `01 - Atlikėjas - Daina.mp3`.

### 7.4 Garsas

- **Ekvalaizeris:** dešimt RBJ smailinių biquad filtrų (Q = 1,41) kiekvienam kanalui; koeficientai
  perskaičiuojami pasikeitus kreivei (tikrinama kas 256 kadrus), išankstinis slopinimas −0,75 × didžiausio
  kėlimo ir švelnus ribotuvas.
- **Sound Check:** ReplayGain iš žymių; kitaip daina fone dekoduojama, matuojami 50 ms RMS blokai, o 95-asis
  procentilis atvaizduojamas į −14 dBFS tikslą (ribos −12…+9 dB).
- **Crossfade:** paskutinėmis 6 s kita daina paleidžiama antrame Sink'e; lygiai seka vienodos galios
  kreives `cos(t·π/2)` / `sin(t·π/2)`; trumpos dainos ir *Repeat One* neslopinami.

### 7.5 Gyvi srautai

`stream.rs` prašo ICY metaduomenų ir išima juos iš garso, seka `.pls/.m3u/.xspf/.asx` grojaraščius (iki
3 lygių), groja HLS (pagrindinis → medijos grojaraštis, MPEG-TS išskaidomas į ADTS/MP3, ID3 pašalinamas)
ir pildo žiedinį buferį, kurį skaito atskira dekodavimo gija. Ištuštėjus buferiui išvedama tyla, o ne
užblokuojamas garso kvietimas. Nutrūkę srautai jungiami iš naujo iki penkių kartų.

### 7.6 Radijo katalogo kūrimas

```text
radio-playlists / Radio Browser eksportas, CC0 (69 781 įrašas)
   │  laukų analizė, be http(s) srauto – lauk, vienodi srautai – lauk
   ▼
official_score(įrašas) ≥ 3 ?                       + sava svetainė (ne laut.fm, zeno.fm, socialiniai
   │                                                  tinklai, nemokamas talpinimas, agregatoriai) +2
   │                                                + logotipas                          +1
   │                                                + FM/AM/DAB/dažnis, visuomeninis/bendruomenės/
   │                                                  regioninis/žinių radijas            +2
   │                                                + svetainė šalies domene              +1
   │                                                − web-radio/online/test žymės         −4
   │                                                − mėgėjiška transliavimo platforma    −3
   │                                                − „radio.<asmeninė-svetainė>“         −2
   ▼
dublikatų sujungimas: ta pati šalis + tas pats vardo raktas („Radijo stotis Lietus“ = „Radio Lietus“)
                      + ta pati svetainė → viena stotis, visi srautai (tiesioginiai pirmi, HLS paskutiniai)
   ▼
crates/core/data/stations.tsv.gz (≈33 700 stočių, 3 MB) ─► catalog.rs veikimo metu:
   žymės → 23 žanrai (raktažodžių taisyklės; be žymių → pagal žodžius pavadinime; kitaip „Kita“)
```

Perkurti: `python3 scripts/make-station-catalog.py <eksportas.txt>` (su `--all` paliekami visi įrašai).

### 7.7 Kalendoriai

`ics.ts` sujungia perkeltas eilutes, atkoduoja tekstą, skaito `DTSTART/DTEND/DURATION`, visos dienos ir
UTC laikus ir išskleidžia `RRULE` (DAILY, WEEKLY su BYDAY, MONTHLY – praleidžiant mėnesius be tos
dienos – ir YEARLY, su INTERVAL, COUNT, UNTIL), atmetant `EXDATE`.

---

## 8. Kompiliavimas ir leidimas

| Tikslas | Komanda | Rezultatas (`release/<os>/`) |
|---|---|---|
| Windows 10/11 | `powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1` | `.msi`, `-setup.exe` |
| Windows iš Linux | `./scripts/build-windows-from-linux.sh` | `-setup.exe`, nešiojama `.zip` |
| Linux | `./scripts/build-linux.sh` (`--no-deps` – be apt/dnf/pacman) | `.deb`, `.rpm`, `.AppImage` |
| macOS universali | `./scripts/build-macos.sh` | `.app`, `.dmg` |
| macOS Apple Silicon | dukart spustelėti `Build WheelDesk for Apple Silicon.command` arba `./scripts/build-macos.sh --install --arm` | `.app`, `.dmg` (arm64) |

Pastabos:

- Windows kryžminiam kompiliavimui naudojami MinGW, NSIS ir `-Zbuild-std` įrankių rinkinys; Windows
  kompiuterio nereikia.
- macOS paketai pasirašomi „ad hoc“, nebent nustatytas `APPLE_SIGNING_IDENTITY` (ir notarizacijos kintamieji).
- Linux `.deb` dėklui reikalauja `libayatana-appindicator3-1 | libappindicator3-1`.
- CI (`.github/workflows/ci.yml`) kiekvieno įkėlimo metu paleidžia testus ir sukuria Windows, Linux,
  macOS universalius ir macOS Apple Silicon paketus; žyma `v*` sukuria juodraštinį leidimą.
- Versija nurodoma keturiose vietose: `Cargo.toml`, `package.json`, `src-tauri/tauri.conf.json`,
  `APP_VERSION` faile `src/App.tsx`.

**Leidimo kontrolinis sąrašas:** pakelti versiją → `npm test` → `cargo test -p wheeldesk-core` → sukurti
paketus → įdiegti ir paleisti kiekvienoje OS → groti failą ir stotį → paslėpti/atkurti iš dėklo →
uždaryti ir atidaryti (tęsimas).

---

## 9. Testavimas

### 9.1 Strategija

```text
                 ┌─────────────────────────┐
                 │ rankinis priėmimas      │  tikras garso įrenginys, dėklas, diegikliai,
                 │ Windows / Linux / macOS │  DPI, internetinis radijas
                 ├─────────────────────────┤
                 │ sąsajos peržiūra        │  kiekvienas ekranas patikrintas vaizdu
                 │ naršyklėje (demo)       │  (scripts/capture-doc-images.py)
                 ├─────────────────────────┤
                 │ integraciniai (Rust)    │  tikri MP3/FLAC/M4A/OGG/AIFF pavyzdžiai:
                 │                         │  žymės, dekodavimas, aplankų albumai, DSP
                 ├─────────────────────────┤
                 │ moduliniai (TS + Rust)  │  navigatorius ir meniu, rato matematika, biblioteka,
                 │                         │  ICS, žaidimai, DSP, katalogas, analizatoriai
                 └─────────────────────────┘
```

### 9.2 Automatiniai testai

| Rinkinys | Kiekis | Ką tikrina |
|---|---|---|
| `src/core/navigator.test.ts` | 44 | Visus meniu: naršymą, nustatymus, grojaraščius, On-The-Go, paiešką, radijo filtrus, istoriją, žadintuvus, užraktą, EQ redaktorių, garso ribą, užrašus, kalendorius, nuotraukas, datą ir laiką, žaidimus, valdymą pele |
| `src/core/library.test.ts` | 13 | Rūšiavimą („The …“), grupavimą, maišymą, laiko formatą |
| `src/core/wheel.test.ts` | 7 | Kampus, žingsnius, pagreitį, paspaudimą ir sukimą |
| `src/core/ics.test.ts` | 4 | Analizę, perkeltas eilutes, savaitinius/mėnesinius/metinius kartojimus, EXDATE |
| `src/core/games/games.test.ts` | 4 | Plytų fiziką ir pauzę, viktorinos dainų atranką ir taškus |
| Rust moduliniai (`cargo test --lib`) | 66 | Diskus, nustatymus, teksto taisymą, bibliotekos spėjimus, grojaraščius, grotuvo taisykles, DSP (EQ atsakas, glotninimas, garsumas, crossfade kreivė), srautus (ICY, PLS/M3U/XSPF/ASX, HLS, TS), katalogą (žanrai, filtrai, sujungimas), viršelių analizatorius, dokumentus |
| Rust integraciniai (`tests/formats.rs`) | 6 | Visi penki formatai dekoduojami, žymės, aplanko albumas, Windows-1251 ID3v1, DSP su tikrais failais |

```bash
npm test                        # TypeScript
cargo test -p wheeldesk-core    # Rust
cargo run -p wheeldesk-core --example catalog   # katalogo statistika
cargo run -p wheeldesk-core --example volumes   # šio kompiuterio diskai
```

### 9.3 Rankinio priėmimo sąrašas

| # | Patikrinimas | Laukiamas rezultatas |
|---|---|---|
| A1 | Įdiegti, paleisti, uždaryti, paleisti vėl | Pasileidžia be klaidų; nustatymai išlieka |
| A2 | Library Source USB diske; prijungti kita raide/vietoje | Randamas tas pats aplankas |
| A3 | Groti kiekvieną formatą; naršyti meniu grojant | Jokių pauzių ar trūkčiojimo |
| A4 | ⏮ po 1 s ir po 10 s; laikyti ⏭ | Ankstesnė daina vs pradžia; persukimas |
| A5 | EQ presetas ir Custom grojant | Girdimas pokytis, be spragtelėjimų |
| A6 | Radijas: šalis → žanras → stotis; ⏮ ⏭ | Groja; lieka filtruotame sąraše; dainos pavadinimas bėga |
| A7 | Stotis, kurios pirmas srautas neveikia | Automatiškai naudojamas kitas srautas |
| A8 | Minimize, spustelėti dėkle, dėklo meniu, Close | Paslepiama/atkuriama; muzika groja; Close uždaro |
| A9 | Uždaryti grojant, atidaryti | Ta pati daina ir vieta |
| A10 | Žadintuvas po minutės, langas paslėptas | Langas iškyla, skamba, Snooze 9 min |
| A11 | 100 %, 150 %, 200 % ekrano mastelis | Ryškus vaizdas, teisingos paspaudimo zonos |
| A12 | Kalba RU/LT; kirilicos/lietuviškos žymės | Matomos visos raidės |

### 9.4 Kas netikrinama automatiškai

Tikras garso išvedimas, dėklo ir lango elgsena, diegikliai, gyvų radijo stočių pasiekiamumas ir
internetiniai viršelių šaltiniai (CI aplinkoje nepasiekiami) tikrinami rankomis.

---

## 10. Naudotojo vadovas

Meniu punktai programoje rodomi pasirinkta kalba; žemiau – angliški pavadinimai (kaip ekrano
vaizduose) su paaiškinimais lietuviškai.

### 10.1 Valdymas

<img src="docs/images/device-now-playing.png" width="260" align="right" alt="Įrenginys grojant">

| Veiksmas | Ratas / pelė | Klaviatūra |
|---|---|---|
| Judėti sąraše | Sukti ratą (tempti ratu) arba pelės ratukas; vairalazdė ▲ ▼ | ↑ ↓ |
| Pasirinkti / atidaryti | Centrinis mygtukas; vairalazdė ▶ | Enter |
| Atgal (MENU) | Rato viršus; vairalazdė ◀ | Esc, Backspace |
| Groti / pauzė | Rato apačia; centro šerdis | Tarpas |
| Ankstesnė / kita | Rato kairė / dešinė (laikant – persukimas) | ← → |
| Į On-The-Go | Laikyti centrinį mygtuką 0,7 s ant dainos, albumo, atlikėjo … | Laikyti Enter |
| Garsas | Šoniniai **+ / −** mygtukai dešinėje briaunoje (laikant kartojasi); ratas Now Playing ekrane | + / −, medijos klavišai |
| Perkelti langą | Tempti korpusą | — |
| Sumažinti / uždaryti | `–` / `×` ant korpuso | — |
| Spausti meniu eilutes | Pasirinktinai: **Settings → Mouse Control** | — |

Slankiklių ekranuose (EQ redaktorius, Volume Limit) vairalazdė/rodyklė **aukštyn didina** reikšmę.
<br clear="right">

### 10.2 Pagrindinis meniu

<img src="docs/images/main-menu.png" width="320" alt="Pagrindinis meniu">

| Punktas | Ką daro |
|---|---|
| **Music** | Muzikos biblioteka (žr. žemiau) |
| **Photos** | Nuotraukos iš pasirinkto aplanko su skaidrių rodymu |
| **Podcasts** | Pasaulio internetinis radijas su filtrais pagal šalį ir žanrą |
| **Extras** | Alarms, Calendars, Clocks, History, Games, Notes, Screen Lock, Stopwatch |
| **Settings** | Visi nustatymai |
| **Shuffle Songs** | Groja visą biblioteką atsitiktine tvarka |
| **Now Playing** | Atsiranda, kai kas nors eilėje; grąžina į grojimo ekraną |

Dešinėje pusėje – grojamo kūrinio viršelis. Punktus galima pridėti ar paslėpti per
**Settings → Main Menu**.

### 10.3 Music – muzika

<img src="docs/images/music-menu.png" width="320" alt="Music meniu"> <img src="docs/images/cover-flow.png" width="320" alt="Cover Flow">

| Punktas | Aprašas |
|---|---|
| **Cover Flow** | Albumai kaip besisukanti viršelių eilė; sukite ratą, centras atidaro albumą |
| **Playlists** | On-The-Go, išsaugoti sąrašai, importuoti failai, **Import from PC…** |
| **Artists** | Atlikėjas → *All Songs* arba albumas → dainos |
| **Albums** | Visi albumai A–Z („The“ nepaisoma), tada dainos pagal numerius |
| **Compilations** | Įvairių atlikėjų albumai |
| **Songs** | Visos dainos A–Z |
| **Genres** | Žanras → atlikėjai → albumai → dainos |
| **Composers** | Kompozitorius → dainos |
| **Audiobooks** | `.m4b` failai ir knygos (žanras „audiobook“) |
| **Search** | Rinkite raides rato raidžių juosta arba klaviatūra; ⏮ trina, ⏭ – į rezultatus |

<img src="docs/images/search.png" width="220" alt="Paieška"> <img src="docs/images/album-songs.png" width="220" alt="Albumo dainos"> <img src="docs/images/artists.png" width="220" alt="Atlikėjai">

**Grojaraščiai.** Laikykite centrinį mygtuką ant bet kurios dainos, albumo, atlikėjo ar žanro – jie
pridedami į **On-The-Go**. On-The-Go sąraše: **Save Playlist** (išsaugo pavadintą sąrašą), **Clear
Playlist** (išvalo). **Import from PC…** leidžia naršyti diskus ir pasirinkti M3U/M3U8/PLS/XSPF/WPL
failus; importuoti failai perskaitomi kaskart, todėl pakeitimai kompiuteryje matomi iš karto.
Trūkstamos dainos parodomos.

<img src="docs/images/playlists.png" width="320" alt="Grojaraščiai"> <img src="docs/images/on-the-go.png" width="320" alt="On-The-Go">

### 10.4 Now Playing – dabar groja

<img src="docs/images/now-playing.png" width="320" alt="Now Playing">

- Rodo „*n* of *viso*“, viršelį, pavadinimą, atlikėją, albumą, praėjusį ir likusį laiką.
- Ratas – garsas. Centras: progresas → **persukimo juosta** (ratu persukama) → atgal. ⏮ ⏭ –
  ankstesnė/kita (⏮ po 3 s grąžina į dainos pradžią).
- Dukart spustelėjus viršelį – viršelis per visą ekraną su grojimo juosta; dar kartą – atgal.
- Įjungus Mouse Control, spustelėjus grojimo juostą peršokama į tą vietą.

### 10.5 Podcasts – pasaulio radijas

<img src="docs/images/radio-menu.png" width="220" alt="Radijo meniu"> <img src="docs/images/radio-countries.png" width="220" alt="Šalys"> <img src="docs/images/radio-country-genres.png" width="220" alt="Žanrai šalyje">

| Punktas | Aprašas |
|---|---|
| **Countries** (Šalys) | Šalis (su stočių skaičiumi) → **All Stations** arba žanras → stotys |
| **Genres** (Žanrai) | Žanras → **All Countries** arba šalis → stotys |
| **Recent Stations** (Neseniai klausytos) | Paskutinės 30 klausytų stočių (iš istorijos) |

<img src="docs/images/radio-stations.png" width="220" alt="Stotys"> <img src="docs/images/radio-now-playing.png" width="220" alt="Groja radijas"> <img src="docs/images/radio-genres.png" width="220" alt="Žanrai">

Pasirinkus stotį, ji įjungiama ir atidaromas Now Playing su ženklu **LIVE**, stoties pavadinimu,
dabartine daina bėgančia eilute, žanru ir aprašu bei dainos viršeliu, jei jis randamas. ⏮ ⏭ pereina
į ankstesnę/kitą stotį **tame pačiame filtruotame sąraše**. Pauzė sustabdo srautą (tęsiama gyvai, ne
su vėlavimu). Jei stoties srautas neveikia, automatiškai bandomi kiti žinomi jos srautai.

Kataloge – tik transliuotojai (§7.6); 23 žanrai, tarp jų Pop, Rokas, Žinios ir pokalbiai, Klasikinė,
Džiazas, Šokių ir elektroninė, Retro, Religinė, Vaikams ir *Kita / be žanro*.

### 10.6 Photos – nuotraukos

<img src="docs/images/photos-menu.png" width="220" alt="Nuotraukos"> <img src="docs/images/photos-grid.png" width="220" alt="Nuotraukų tinklelis"> <img src="docs/images/photo-full.png" width="220" alt="Nuotrauka">

| Punktas | Aprašas |
|---|---|
| **All Photos** | Visos pasirinkto aplanko ir jo poaplankių nuotraukos (JPG, PNG, GIF, WebP, BMP) |
| *Albumų aplankai* | Kiekvienas poaplankis – albumas |
| **Slideshow Settings** | Time Per Slide (2–20 s), Repeat, Shuffle Photos, Transitions (sklandus perėjimas) |
| **Choose Folder…** | Diskas → aplankas → *Use This Folder* |

Tinklelyje: ratas – judėti, ⏮ ⏭ – puslapis, centras – atidaryti nuotrauką, ⏯ – skaidrių rodymas.
Nuotraukos vaizde: ratas – ankstesnė/kita, ⏯ – pradėti/sustabdyti skaidres, centras – atgal.

### 10.7 Extras – papildomai

<img src="docs/images/extras-menu.png" width="320" alt="Extras">

| Punktas | Aprašas |
|---|---|
| **Alarms** (Žadintuvai) | **Create Alarm**; kiekvienam: įjungtas/išjungtas, **Time** (laikas ratu), **Repeat** (Once, Every Day, Weekdays, Weekends), **Alert** (Beep, Shuffle Songs, išsaugotas ar importuotas grojaraštis), **Delete Alarm**. Suskambus langas iškyla: **Dismiss** arba **Snooze** (9 min) |
| **Calendars** (Kalendoriai) | **Add Calendar File…** (.ics); kalendorius arba **All Calendars** atidaro mėnesio vaizdą: ratas – diena, ⏮ ⏭ – mėnuo, ⏯ – šiandien, centras – dienos įvykiai → įvykio aprašas. **Remove Calendar** |
| **Clocks** (Laikrodžiai) | Šio kompiuterio laikas ir pasaulio miestai (**Add Clock** → regionas → miestas); kiekvienas: aštuonkampis ciferblatas, data, skirtumas; **Change City**, **Delete Clock** |
| **History** (Istorija) | Visos grotos dainos ir radijo dainos, naujausios viršuje su laiku („Vakar 15:43“); pasirinkus – groja vėl; **Clear History**; iki 500 įrašų |
| **Games** (Žaidimai) | **Plytos** (ratas – platforma, centras – paleisti/pauzė, lygiai greitėja) ir **Muzikos viktorina** (10 raundų: groja daina iš jūsų bibliotekos, per 10 s išrinkite pavadinimą iš keturių) |
| **Notes** (Užrašai) | Tekstiniai failai (.txt, .md) iš pasirinkto aplanko; ratas slenka, ⏮ ⏭ – puslapiai; UTF-8, UTF-16 ir senos Windows koduotės |
| **Screen Lock** (Ekrano užraktas) | **Set Combination** (4 skaitmenys ratu ar klaviatūra), **Lock**: viskas užrakinta, kol neįvestas kodas, net po paleidimo iš naujo |
| **Stopwatch** (Chronometras) | **Timer**: ⏯ start/stop, centras – ratas (arba sustabdžius – nunulinti ir išsaugoti įrašą); įrašų sąrašas su ratais; **Clear Logs**. Veikia ir naudojantis kitais meniu |

<img src="docs/images/alarm-editor.png" width="220" alt="Žadintuvas"> <img src="docs/images/alarm-ringing.png" width="220" alt="Skamba žadintuvas"> <img src="docs/images/calendar-month.png" width="220" alt="Kalendorius">
<img src="docs/images/calendar-day.png" width="220" alt="Diena"> <img src="docs/images/calendar-event.png" width="220" alt="Įvykis"> <img src="docs/images/clocks.png" width="220" alt="Laikrodžiai">
<img src="docs/images/clock-face.png" width="220" alt="Laikrodis"> <img src="docs/images/history.png" width="220" alt="Istorija"> <img src="docs/images/games.png" width="220" alt="Žaidimai">
<img src="docs/images/game-bricks.png" width="220" alt="Plytos"> <img src="docs/images/game-music-quiz.png" width="220" alt="Muzikos viktorina"> <img src="docs/images/notes.png" width="220" alt="Užrašai">
<img src="docs/images/note-reader.png" width="220" alt="Užrašas"> <img src="docs/images/screen-lock-menu.png" width="220" alt="Ekrano užraktas"> <img src="docs/images/screen-lock-combination.png" width="220" alt="Kodas">
<img src="docs/images/stopwatch.png" width="220" alt="Chronometras">

### 10.8 Settings – nustatymai

<img src="docs/images/settings-1.png" width="220" alt="Nustatymai 1"> <img src="docs/images/settings-2.png" width="220" alt="Nustatymai 2"> <img src="docs/images/settings-3.png" width="220" alt="Nustatymai 3">

| Punktas | Aprašas |
|---|---|
| **About** | Dainų ir albumų skaičius, bibliotekos šaltinis, versija |
| **Shuffle** | Off · Songs · Albums (išjungta · dainos · albumai) |
| **Repeat** | Off · One · All (išjungta · viena · visos) |
| **Main Menu** | Įjungti/išjungti pagrindinio meniu punktus (Music, Cover Flow, Playlists, Artists, Albums, Songs, Search, Photos, Podcasts, Extras, Alarms, Clocks, History, Stopwatch, Screen Lock, Shuffle Songs …); **Reset Menu**. Settings lieka visada |
| **Music Menu** | Įjungti/išjungti Music meniu punktus; **Reset Menu** |
| **Volume Limit** | Didžiausias garsas ratu; **Done** arba **Lock Volume Limit** su 4 skaitmenų kodu (tada keisti galima tik su kodu, riba išlieka ir po *Reset Settings*); **Remove Lock** |
| **Backlight** | Ekranas pritemsta po 2, 5, 10, 15, 20, 30 s arba *Always On* |
| **Audio Crossfade** | Įj./išj. – 6 sekundžių perėjimas tarp dainų |
| **Sound Check** | Įj./išj. – vienodas visų dainų garsumas |
| **EQ** | 22 presetai (Acoustic … Vocal Booster) arba **Custom**: dešimt stulpelių 32 Hz–16 kHz, ratas ±0,5 dB, centras/⏭ – kita juosta, ⏮ – ankstesnė, „0“ – lygu |
| **Clicker** | Rato spragsėjimo garsas įj./išj. |
| **Mouse Control** | Pagal nutylėjimą išjungta; įjungus – meniu eilutės, grojimo juosta, kalendoriaus dienos, nuotraukos ir žaidimai reaguoja į spustelėjimus |
| **Date & Time** | Šio kompiuterio laikas, data ir laiko juosta; **24-Hour Clock**; **Time in Title** |
| **Language** | English, Lietuvių, Русский |
| **Library Source** | Diskas (su dydžiu) → aplankai → **Use This Folder**; įsimenama pagal disko ID |
| **Legal** | Autorius, licencija, atviro kodo komponentai ir duomenų šaltiniai |
| **Reset Settings** | **Cancel** / **Reset All** (bibliotekos šaltinis, garsas ir užrakinta garso riba išlieka) |

<img src="docs/images/eq-presets.png" width="220" alt="EQ presetai"> <img src="docs/images/eq-editor.png" width="220" alt="EQ redaktorius"> <img src="docs/images/volume-limit.png" width="220" alt="Garso riba">
<img src="docs/images/main-menu-editor.png" width="220" alt="Main Menu redaktorius"> <img src="docs/images/date-time.png" width="220" alt="Data ir laikas"> <img src="docs/images/library-source.png" width="220" alt="Bibliotekos šaltinis">
<img src="docs/images/library-folder.png" width="220" alt="Use This Folder"> <img src="docs/images/about.png" width="220" alt="Apie"> <img src="docs/images/legal.png" width="220" alt="Teisinė informacija">

### 10.9 Dėklas, uždarymas ir tęsimas

- **Minimize (`–`)** paslepia grotuvą prie sistemos laikrodžio; muzika, radijas ir žadintuvai veikia.
  Spustelėjus piktogramą – parodo/paslepia; dešiniu pelės mygtuku – *Rodyti, Groti/pauzė, Kita daina,
  Ankstesnė daina, Išeiti*. Jei dėklo nėra (pvz., GNOME be *AppIndicator* plėtinio), minimize veikia
  įprastai.
- **Close (`×`)** visiškai uždaro programą.
- Kitą kartą paleidus, WheelDesk tęsia tą pačią eilę, dainą ir vietą arba tą pačią stotį tame pačiame
  filtruotame sąraše.

### 10.10 Problemų sprendimas

| Problema | Ką daryti |
|---|---|
| Nerodoma muzika | Patikrinkite **Settings → Library Source**; palaikomi MP3, M4A, FLAC, OGG, AIFF |
| Netinkamos raidės pavadinimuose | Dažniausiai pataisoma automatiškai; perskenuokite, iš naujo pasirinkdami aplanką |
| Stotis negroja | Bandykite kitą; srautai keičiasi – katalogas yra momentinė kopija |
| Nėra viršelių | Viršeliams vieną kartą reikia interneto; vietiniai `cover.jpg`/`folder.jpg` veikia visada |
| Linux nėra piktogramos dėkle | Įdiekite `libayatana-appindicator3-1`; GNOME įjunkite *AppIndicator Support* |
| macOS: „negalima atidaryti“ | Dešinys pelės mygtukas → Open arba `xattr -cr /Applications/WheelDesk.app` |
| Pradėti iš naujo | Uždarykite programą, ištrinkite `settings.json` ir podėlio aplanką (§6.9) |

---

## 11. Privatumas ir tinklo naudojimas

WheelDesk neturi paskyrų, telemetrijos ar analitikos. Biblioteka, istorija ir nustatymai lieka vietiniuose
failuose. Į internetą programa kreipiasi tik:

| Kada | Kur | Kas siunčiama |
|---|---|---|
| Nėra vietinio viršelio | musicbrainz.org, coverartarchive.org, theaudiodb.com, en.wikipedia.org | Atlikėjo ir albumo (ar dainos) pavadinimas |
| Klausotės stoties | Stoties srauto serveris | Įprasta HTTP užklausa (jūsų IP adresas) |
| Radijo dainai reikia viršelio | Tie patys atviri šaltiniai | Atlikėjas ir pavadinimas iš srauto |

Nustatymai nešifruojami; 4 skaitmenų kodai – patogumo užraktas, ne saugumo priemonė.

---

## 12. Apribojimai ir planai

**Žinomi apribojimai**

- Drobės sąsaja: kol kas be ekrano skaitytuvų semantikos.
- Radijo katalogas – momentinė kopija; „oficialumas“ nustatomas pagal požymius (§7.6), todėl dalis vien
  internetinių stočių lieka; srautų pasiekiamumas keičiasi.
- Užrašai ir kalendoriai tik skaitomi; ICS palaiko dažniausias kartojimo taisykles.
- macOS paketus reikia kurti Mac kompiuteryje arba CI.
- Žadintuvai skamba tik veikiant programai ir neužmigus kompiuteriui.

**Idėjos kitoms versijoms:** klaviatūra pasiekiama tekstinė alternatyva ekrano skaitytuvams, stočių
paieška pagal pavadinimą, mėgstamos stotys, dainų žodžiai iš žymių, RSS tinklalaidės šalia radijo,
pasirašyti ir notarizuoti macOS paketai.

---

## 13. Prisidėjimas prie kūrimo

- **Naujas meniu punktas:** pridėkite eilutės raktą į `src/core/strings.ts` (EN, LT, RU), sukurkite
  ekraną `src/core/menus.ts` (punktai arba savas `draw`), pridėkite testą `navigator.test.ts`.
- **Nauja kalba:** pridėkite lentelę `strings.ts` ir pasirinkimą *Settings → Language*; įdėtas Inter
  šriftas apima lotynų, išplėstinę lotynų ir kirilicos abėcėles.
- **Nauja žanro taisyklė:** keiskite `RULES` faile `crates/core/src/catalog.rs`; papildykite
  `tags_become_genres`.
- **Atnaujinti radijo katalogą:** `python3 scripts/make-station-catalog.py <eksportas.txt>`.
- **Atnaujinti ekrano vaizdus:** žr. [`docs/images/README.lt.md`](docs/images/README.lt.md).
- Stilius: TypeScript griežtas režimas, `cargo fmt`, komentarai paaiškina *kodėl*. Po kiekvieno
  pakeitimo `npm test` ir `cargo test -p wheeldesk-core` turi praeiti.

---

## 14. Licencija ir autorystė

WheelDesk platinamas pagal **[MIT licenciją](LICENSE)**.

```text
Copyright (c) 2026 Aleksandr Igumenov (original idea and first author) and WheelDesk contributors
```

**Kiekvienas gali naudoti, nagrinėti, keisti ir platinti šį projektą – taip pat ir mokymosi bei
mokymo tikslais.** MIT licencija reikalauja, kad aukščiau esantis autorių teisių pranešimas ir licencijos
tekstas liktų visose programinės įrangos kopijose ar esminėse jos dalyse, todėl idėjos autoriaus vardas
keliauja kartu su kiekviena kopija.

Naudodami WheelDesk kurse, baigiamajame darbe, straipsnyje ar išvestiniame projekte, prašome nurodyti:

> *WheelDesk – retro stiliaus muzikos grotuvas su valdymo ratu. Idėjos autorius ir pirmasis autorius:
> Aleksandr Igumenov. https://github.com/A-Igumenov/WheelDesk (MIT licencija).*

### Trečiųjų šalių komponentai

WheelDesk MIT licencija taikoma jo paties kodui. Bibliotekos turi savo licencijas, ir visos jos leidžia
tokį naudojimą:

| Komponentas | Licencija |
|---|---|
| Tauri, `@tauri-apps/api`, `@tauri-apps/cli` | Apache-2.0 OR MIT |
| React, React DOM, Vite, Vitest | MIT |
| TypeScript | Apache-2.0 |
| rodio, cpal, lofty, serde, rayon, ureq, flate2, directories, base64 | MIT OR Apache-2.0 |
| Symphonia (garso dekodavimas) | MPL-2.0 (failų lygio copyleft; naudojama nekeista) |
| encoding_rs | (Apache-2.0 OR MIT) AND BSD-3-Clause |
| sysinfo | MIT |
| walkdir | Unlicense OR MIT |
| Inter šriftas (`@fontsource/inter`) | SIL Open Font License 1.1 |

Iš 507 Rust paketų `Cargo.lock` faile licencijos yra MIT, Apache-2.0, BSD, ISC, Zlib, Unicode-3.0,
Unlicense arba MPL-2.0 – visos suderinamos su WheelDesk platinimu pagal MIT. Platinant sukompiliuotas
programas, išsaugokite šių komponentų pranešimus (pavyzdžiui, kartu pridėdami jų licencijų tekstus).

### Duomenų šaltiniai

| Duomenys | Šaltinis | Licencija / sąlygos | Kaip naudojama |
|---|---|---|---|
| Pasaulio radijo stočių katalogas (`crates/core/data/stations.tsv.gz`) | [AlonDrilich/radio-playlists](https://github.com/AlonDrilich/radio-playlists) – kas savaitę atnaujinama bendruomenės katalogo [Radio Browser](https://www.radio-browser.info/) kopija | Stočių duomenys: **CC0 1.0** (perdavimas į viešąją sritį, failas `LICENSE-DATA` toje saugykloje); jos skriptai: MIT | Atrinkti transliuotojai, sujungti dublikatai, konvertuota `scripts/make-station-catalog.py`; įdėta į programą |
| Stočių pavadinimai, logotipai, srautai | Pačios radijo stotys | Lieka atitinkamų stočių nuosavybė | Rodoma ir grojama tiesiai iš stočių serverių; logotipai ir garsas neplatinami |
| Albumų ir dainų viršeliai | MusicBrainz / Cover Art Archive, TheAudioDB, Wikipedia | Kiekvieno šaltinio sąlygos | Ieškoma tik nesant vietinio viršelio; saugoma tik vietoje, neplatinama |

CC0 nereikalauja nurodyti šaltinio, tačiau katalogo kilmę nurodome aukščiau ir **Settings → Legal**
ekrane. Taip pat žr. [`NOTICE.md`](NOTICE.md).

**Prekių ženklai:** WheelDesk – nepriklausomas projektas. Jis nesusijęs su jokiu įrenginių gamintoju,
nėra jo remiamas ar patvirtintas; valdymas ratu atkurtas su originaliu dizainu.
