# WheelDesk 1.3.0 – minimalūs šaltiniai kūrimui

Šis paketas skirtas programos kodui redaguoti, testuoti ir kompiliuoti. Išlaikyta originali projekto struktūra ir užrakintos priklausomybių versijos.

- `src/` – React / TypeScript sąsaja, Canvas, navigacija ir testai.
- `crates/core/` – Rust garso, bibliotekos, metaduomenų ir platformų branduolys bei testai.
- `src-tauri/` – darbalaukio integracija, konfigūracija ir ikonos.
- `assets/` – veikimui reikalingas radijo katalogas ir originalūs projekto ištekliai.
- Šakniniai manifestai, užrakto failai ir konfigūracijos – priklausomybėms ir kompiliavimui.
- `licenses/` – licencijų tekstai, autorystės pranešimai, įrodymai ir nedideli MPL šaltinių archyvai. Katalogas išlaikytas, nes jį naudoja Tauri išteklių konfigūracija.

Neįtraukti diegikliai, kompiliavimo rezultatai, `node_modules`, talpyklos, prototipo dokumentacija, publikavimo scenarijai ir didieji Linux bibliotekų šaltinių archyvai. Priklausomybes pateikia npm ir Cargo; jų paruoštų talpyklų šiame ZIP nėra. Windows kompiliavimo instrukcija palikta atskirai darbinio aplanko README.

## Licencijos

Originalus projekto kodas: [MIT](LICENSE). Trečiųjų šalių sąlygos ir pranešimai pateikti `licenses/`.

Tai kūrimo paketas, ne pilnas vykdomųjų paketų platinimo rinkinys. Platinant AppImage kartu pateikiamas pilnas `WheelDesk_1.3.0-source.zip` su reikiamais atitinkamais Linux šaltiniais; šis mažasis ZIP jo nepakeičia.

[English](README.md) · [Projekto saugykla](https://github.com/A-Igumenov/WheelDesk)
