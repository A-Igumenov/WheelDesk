//! Product regression checks using temporary files; no network or audio device required.
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use wheeldesk_core::{docs, library, playlists, settings::Settings};

static NEXT: AtomicU64 = AtomicU64::new(0);
struct Sandbox(PathBuf);
impl Sandbox {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("wheeldesk-regression-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}
impl Drop for Sandbox {
    fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); }
}

#[test]
fn ui_resume_and_locks_survive_multiple_native_saves() {
    let dir = Sandbox::new();
    let mut settings = Settings::default();
    settings.extra.insert("resume".into(), serde_json::json!({
        "kind": "tracks", "paths": ["/music/Žvaigždė.mp3"], "index": 0, "positionMs": 42000, "playing": false
    }));
    settings.extra.insert("locked".into(), serde_json::json!(true));
    settings.extra.insert("lockCode".into(), serde_json::json!("1234"));
    settings.extra.insert("volumeLimitCode".into(), serde_json::json!("5678"));
    settings.save(&dir.0).unwrap();
    let mut loaded = Settings::load(&dir.0);
    assert_eq!(loaded, settings);
    loaded.extra.insert("resume".into(), serde_json::json!({ "kind": "radio", "slug": "lrt-opus", "playing": true }));
    loaded.save(&dir.0).unwrap();
    assert_eq!(Settings::load(&dir.0), loaded);
    assert!(!dir.0.join("settings.json.tmp").exists());
}

#[test]
fn settings_report_an_unwritable_destination_without_corrupting_existing_file() {
    let dir = Sandbox::new();
    let blocker = dir.0.join("not-a-directory");
    fs::write(&blocker, b"keep me").unwrap();
    assert!(Settings::default().save(&blocker).is_err());
    assert_eq!(fs::read(&blocker).unwrap(), b"keep me");
}

#[test]
fn note_reader_limits_large_documents_and_reports_missing_files() {
    let dir = Sandbox::new();
    let note = dir.0.join("large.md");
    fs::write(&note, vec![b'a'; docs::MAX_TEXT_BYTES as usize + 100]).unwrap();
    assert_eq!(docs::read_text(&note).unwrap().len(), docs::MAX_TEXT_BYTES as usize);
    assert!(docs::read_text(&dir.0.join("missing.txt")).is_err());
}

#[test]
fn photo_discovery_skips_hidden_files_and_honors_the_result_limit() {
    let dir = Sandbox::new();
    fs::create_dir_all(dir.0.join("album")).unwrap();
    fs::create_dir_all(dir.0.join(".private")).unwrap();
    for path in ["album/a.jpg", "album/b.PNG", ".hidden.jpg", ".private/c.jpg", "readme.txt"] {
        fs::write(dir.0.join(path), b"fixture").unwrap();
    }
    let extensions = vec!["jpg".into(), "png".into()];
    let found = docs::find_files(&dir.0, &extensions, 20);
    assert_eq!(found.len(), 2);
    assert!(found.iter().all(|p| PathBuf::from(p).parent() == Some(dir.0.join("album").as_path())));
    assert_eq!(docs::find_files(&dir.0, &extensions, 1).len(), 1);
    assert!(docs::find_files(&dir.0, &extensions, 0).is_empty());
}

#[test]
fn a_playlist_is_reread_after_external_edits_with_unicode_paths() {
    let dir = Sandbox::new();
    let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/a.mp3");
    fs::copy(source, dir.0.join("Žvaigždė.mp3")).unwrap();
    let path = dir.0.join("Kelionė.m3u8");
    fs::write(&path, "#EXTM3U\nŽvaigždė.mp3\n").unwrap();
    let initial = playlists::read(&path).unwrap();
    assert_eq!(initial.tracks.len(), 1);
    assert!(initial.missing.is_empty());
    fs::write(&path, "#EXTM3U\nmissing.mp3\nŽvaigždė.mp3\n").unwrap();
    let changed = playlists::read(&path).unwrap();
    assert_eq!(changed.tracks[0].0, 1);
    assert_eq!(changed.missing[0].position, 0);
    assert_eq!(changed.missing[0].file_name, "missing.mp3");
}

#[test]
fn library_cache_removes_deleted_tracks_and_finds_new_tracks() {
    let dir = Sandbox::new(); let cache = Sandbox::new();
    let fixtures = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    fs::copy(fixtures.join("a.mp3"), dir.0.join("first.mp3")).unwrap();
    assert_eq!(library::scan(&dir.0, Some(&cache.0), &|_, _| {}).len(), 1);
    fs::remove_file(dir.0.join("first.mp3")).unwrap();
    fs::copy(fixtures.join("b.flac"), dir.0.join("second.flac")).unwrap();
    let updated = library::scan(&dir.0, Some(&cache.0), &|_, _| {});
    assert_eq!(updated.len(), 1);
    assert!(updated[0].path.ends_with("second.flac"));
    assert_eq!(library::cached(&dir.0, &cache.0).len(), 1);
    assert!(library::cached(&dir.0, &cache.0)[0].path.ends_with("second.flac"));
}
