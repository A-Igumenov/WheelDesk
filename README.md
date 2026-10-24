# WheelDesk 1.3.0 – minimal development source

This package is for editing, testing and compiling the application. It preserves the original project structure and dependency lockfiles.

- `src/` – React / TypeScript UI, Canvas, navigation and tests.
- `crates/core/` – Rust audio, library, metadata and platform core, with tests.
- `src-tauri/` – desktop integration, configuration and icons.
- `assets/` – required radio directory and original project assets.
- Root manifests, lockfiles and configuration – dependencies and compilation.
- `licenses/` – licence texts, attribution, evidence and small MPL source archives. Retained because Tauri's resource configuration uses this directory.

Excluded: installers, build outputs, `node_modules`, caches, prototype documentation, publication scripts and large Linux library source archives. npm and Cargo supply dependencies; their prepared caches are not included. Windows build instructions remain separately in the working-directory README.

## Licensing

Original project code: [MIT](LICENSE). Third-party terms and attribution are retained in `licenses/`.

This is a development package, not a complete executable redistribution bundle. AppImage redistribution must accompany the full `WheelDesk_1.3.0-source.zip` with its corresponding Linux sources; this small ZIP does not replace that bundle.

[Lietuviškai](README_LT.md) · [Project repository](https://github.com/A-Igumenov/WheelDesk)
