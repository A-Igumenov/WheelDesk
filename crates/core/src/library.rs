//! Music library: finds audio files under a folder, reads their tags in
//! parallel and keeps a cache so a rescan only reads files that changed.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::UNIX_EPOCH;

use lofty::prelude::*;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

/// Formats the player can decode. WAV is excluded on purpose.
pub const AUDIO_EXTENSIONS: &[&str] = &["mp3", "m4a", "m4b", "aac", "flac", "ogg", "oga", "aif", "aiff"];

/// Folder names never worth descending into (system, caches, version control).
const SKIP_DIRS: &[&str] = &[
    "$recycle.bin", "system volume information", "windows", "program files", "program files (x86)",
    "programdata", "appdata", "node_modules", ".git", ".svn", ".cache", ".trash", ".trashes",
    ".spotlight-v100", ".fseventsd", "lost+found", "__pycache__",
];

/// Top-level folders of a Unix system root that never hold music.
const SKIP_ROOTS: &[&str] = &[
    "/proc", "/sys", "/dev", "/run", "/usr", "/bin", "/sbin", "/lib", "/lib32", "/lib64", "/libx32",
    "/etc", "/boot", "/snap", "/var", "/opt", "/tmp", "/System", "/Applications", "/private", "/cores",
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub path: String,
    pub title: String,
    pub artist: String,
    pub album_artist: String,
    pub album: String,
    pub genre: String,
    pub composer: String,
    pub track_no: u32,
    pub disc_no: u32,
    pub year: u32,
    pub duration_ms: u64,
    pub compilation: bool,
    /// File change stamp, used to skip unchanged files on rescan.
    pub mtime: u64,
    pub size: u64,
    /// ReplayGain track gain in dB (Sound Check), when the file is tagged with it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gain_db: Option<f32>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Cache {
    root: String,
    tracks: Vec<Track>,
}

const CACHE_FILE: &str = "library-cache.json";

fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

pub(crate) fn skip_dir(path: &Path) -> bool {
    let name = path.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    if SKIP_DIRS.contains(&name.as_str()) || name.starts_with('$') {
        return true;
    }
    let p = path.to_string_lossy();
    SKIP_ROOTS.iter().any(|r| p == *r)
}

fn stamp(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// All audio files below `root` with their change stamp and size.
pub fn find_audio_files(root: &Path) -> Vec<(PathBuf, u64, u64)> {
    WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| e.depth() == 0 || !e.file_type().is_dir() || !skip_dir(e.path()))
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file() && is_audio(e.path()))
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            Some((e.into_path(), stamp(&meta), meta.len()))
        })
        .collect()
}

/// Reads tags; falls back to the file and folder names when tags are missing,
/// so every file still shows up somewhere in the menus. Text in old code pages
/// is repaired, including titles taken from file names.
pub fn read_track(path: &Path, mtime: u64, size: u64) -> Track {
    let mut t = read_track_raw(path, mtime, size);
    finish(&mut t);
    t
}

/// Repairs text and fills in what the file name tells (artist, track number).
/// Safe to run again on already finished tracks (cached index).
fn finish(t: &mut Track) {
    repair_text(t);
    infer_from_name(t);
}

/// "001 Artist - Title", "01_-_Artist_-_Title", "1. Artist – Title": when the
/// tags have no artist, take it (and the track number) from the file name, or
/// from a title tag of the same form.
pub fn infer_from_name(t: &mut Track) {
    if !t.artist.is_empty() || !t.album_artist.is_empty() {
        return;
    }
    let stem = Path::new(&t.path)
        .file_stem()
        .map(|s| crate::text::fix_legacy(&s.to_string_lossy()))
        .unwrap_or_default();
    let from_file = t.title.is_empty() || t.title == stem;
    let source = if from_file { stem } else { t.title.clone() };
    let (num, rest) = split_track_number(&underscores_to_spaces(&source));
    if let Some((artist, title)) = split_artist_title(&rest) {
        t.artist = artist;
        t.title = title;
    } else if from_file && !rest.is_empty() {
        t.title = rest;
    } else {
        return;
    }
    if t.track_no == 0 {
        t.track_no = num.unwrap_or(0);
    }
}

fn underscores_to_spaces(s: &str) -> String {
    let s = if !s.contains(' ') || s.matches('_').count() > s.matches(' ').count() { s.replace('_', " ") } else { s.to_string() };
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Leading "01 ", "001_", "1. ", "7 - " → (number, rest). A plain "99 Luftballons"
/// keeps its number: without a leading zero or a separator it may be the title.
fn split_track_number(s: &str) -> (Option<u32>, String) {
    let digits: String = s.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() || digits.len() > 3 {
        return (None, s.to_string());
    }
    let after = &s[digits.len()..];
    let sep = after.chars().next();
    let marked = matches!(sep, Some('.' | '-' | '_' | ')')) || after.trim_start().starts_with('-');
    if !(marked || (digits.starts_with('0') && sep == Some(' '))) {
        return (None, s.to_string());
    }
    let rest = after.trim_start_matches(|c: char| c == '.' || c == '-' || c == '_' || c == ')' || c.is_whitespace());
    if rest.is_empty() {
        return (None, s.to_string());
    }
    (digits.parse().ok(), rest.to_string())
}

fn split_artist_title(s: &str) -> Option<(String, String)> {
    for sep in [" - ", " – ", " — "] {
        if let Some((a, t)) = s.split_once(sep) {
            let (a, t) = (a.trim(), t.trim());
            if !a.is_empty() && !t.is_empty() && !a.chars().all(|c| c.is_ascii_digit()) {
                return Some((a.to_string(), t.to_string()));
            }
        }
    }
    None
}

fn read_track_raw(path: &Path, mtime: u64, size: u64) -> Track {
    let file_stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let mut t = Track {
        path: path.to_string_lossy().to_string(),
        title: file_stem,
        artist: String::new(),
        album_artist: String::new(),
        album: String::new(),
        genre: String::new(),
        composer: String::new(),
        track_no: 0,
        disc_no: 0,
        year: 0,
        duration_ms: 0,
        compilation: false,
        mtime,
        size,
        gain_db: None,
    };

    let Ok(tagged) = lofty::read_from_path(path) else {
        return t;
    };
    t.duration_ms = tagged.properties().duration().as_millis() as u64;

    let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) else {
        return t;
    };
    let clean = |s: Option<std::borrow::Cow<'_, str>>| s.map(|v| v.trim().to_string()).unwrap_or_default();
    let title = clean(tag.title());
    if !title.is_empty() {
        t.title = title;
    }
    t.artist = clean(tag.artist());
    t.album = clean(tag.album());
    t.genre = clean(tag.genre());
    t.album_artist = tag.get_string(&ItemKey::AlbumArtist).unwrap_or_default().trim().to_string();
    t.composer = tag.get_string(&ItemKey::Composer).unwrap_or_default().trim().to_string();
    t.track_no = tag.track().unwrap_or(0);
    t.disc_no = tag.disk().unwrap_or(0);
    t.year = tag.year().unwrap_or(0);
    t.compilation = matches!(
        tag.get_string(&ItemKey::FlagCompilation).map(|s| s.trim().to_ascii_lowercase()),
        Some(ref v) if v == "1" || v == "true"
    );
    t.gain_db = tag.get_string(&ItemKey::ReplayGainTrackGain).and_then(parse_gain);
    t
}

/// "-6.48 dB" → -6.48.
pub fn parse_gain(s: &str) -> Option<f32> {
    let v: f32 = s.trim().trim_end_matches(|c: char| c.is_alphabetic() || c.is_whitespace()).trim().parse().ok()?;
    (v.is_finite() && v.abs() < 60.0).then_some(v)
}

/// Old Windows code pages in tags (Russian/Lithuanian shown as "Íàòàøà").
fn repair_text(t: &mut Track) {
    use crate::text::fix_legacy;
    for f in [&mut t.title, &mut t.artist, &mut t.album_artist, &mut t.album, &mut t.genre, &mut t.composer] {
        *f = fix_legacy(f);
    }
}

/// Scans `root`, reusing cached tags for unchanged files. `progress(done, total)`
/// is called from worker threads while tags are read.
pub fn scan(root: &Path, cache_dir: Option<&Path>, progress: &(dyn Fn(usize, usize) + Sync)) -> Vec<Track> {
    let root_str = root.to_string_lossy().to_string();
    let cached: HashMap<String, Track> = cache_dir
        .and_then(|d| fs::read_to_string(d.join(CACHE_FILE)).ok())
        .and_then(|s| serde_json::from_str::<Cache>(&s).ok())
        .filter(|c| c.root == root_str)
        .map(|c| c.tracks.into_iter().map(|t| (t.path.clone(), t)).collect())
        .unwrap_or_default();

    let files = find_audio_files(root);
    let total = files.len();
    progress(0, total);
    let done = AtomicUsize::new(0);

    // Leave one core free so playback and the UI never stutter during a scan.
    let workers = std::thread::available_parallelism().map(|n| n.get().saturating_sub(1).max(1)).unwrap_or(1);
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(workers)
        .thread_name(|i| format!("wheeldesk-scan-{i}"))
        .build()
        .expect("scan thread pool");

    let mut tracks: Vec<Track> = pool.install(|| files
        .par_iter()
        .map(|(path, mtime, size)| {
            let key = path.to_string_lossy();
            let track = match cached.get(key.as_ref()) {
                Some(t) if t.mtime == *mtime && t.size == *size => {
                    // Indexes from older versions may hold unrepaired text.
                    let mut t = t.clone();
                    finish(&mut t);
                    t
                }
                _ => read_track(path, *mtime, *size),
            };
            let n = done.fetch_add(1, Ordering::Relaxed) + 1;
            if n % 64 == 0 || n == total {
                progress(n, total);
            }
            track
        })
        .collect());
    tracks.sort_by(|a, b| a.path.cmp(&b.path));

    if let Some(dir) = cache_dir {
        let cache = Cache { root: root_str, tracks: tracks.clone() };
        if fs::create_dir_all(dir).is_ok() {
            if let Ok(json) = serde_json::to_string(&cache) {
                let tmp = dir.join(format!("{CACHE_FILE}.tmp"));
                if fs::write(&tmp, json).is_ok() {
                    let _ = fs::rename(&tmp, dir.join(CACHE_FILE));
                }
            }
        }
    }
    // The cache keeps the tags as read; folder albums are applied on top.
    organize_albums(&mut tracks);
    tracks
}

/// "CD1", "Disc 2", "Disk 3", "CD 02" → disc number.
fn disc_folder(name: &str) -> Option<u32> {
    let l = name.trim().to_lowercase();
    let rest = ["cd", "disc", "disk", "diskas"].iter().find_map(|p| l.strip_prefix(p))?;
    let digits = rest.trim_start_matches(|c: char| c == ' ' || c == '_' || c == '-' || c == '.');
    (!digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit())).then(|| digits.parse().ok()).flatten()
}

pub const VARIOUS_ARTISTS: &str = "Various Artists";

/// Albums by folder, the way people keep music on a PC:
/// - the songs in one folder that share an album tag → that album for all of
///   them, including songs in the folder without an album tag;
/// - songs with different album tags, or no album tags at all → the folder's
///   name is the album;
/// - "CD1"/"Disc 2" sub-folders belong to their parent folder's album.
/// A folder album with several artists becomes one album by "Various Artists"
/// (a compilation), so it is not split by artist.
pub fn organize_albums(tracks: &mut [Track]) {
    use std::collections::BTreeMap;
    let mut groups: BTreeMap<String, Vec<usize>> = BTreeMap::new();
    for (i, t) in tracks.iter().enumerate() {
        let dir = Path::new(&t.path).parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
        groups.entry(dir).or_default().push(i);
    }
    let norm = |s: &str| s.trim().to_lowercase();

    for (dir, idx) in groups {
        let dir_path = Path::new(&dir);
        let mut folder = dir_path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        if let Some(disc) = disc_folder(&folder) {
            if let Some(parent) = dir_path.parent() {
                folder = parent.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            }
            for &i in &idx {
                if tracks[i].disc_no == 0 {
                    tracks[i].disc_no = disc;
                }
            }
        }
        let folder = crate::text::fix_legacy(&underscores_to_spaces(&folder));

        // Distinct album tags in this folder (case and spacing ignored).
        let mut tagged: Vec<(String, String)> = Vec::new();
        for &i in &idx {
            let a = tracks[i].album.trim();
            if !a.is_empty() && !tagged.iter().any(|(n, _)| *n == norm(a)) {
                tagged.push((norm(a), a.to_string()));
            }
        }
        let album = match tagged.len() {
            1 => tagged[0].1.clone(),
            _ if !folder.is_empty() => folder.clone(),
            _ => continue,
        };
        for &i in &idx {
            tracks[i].album = album.clone();
        }

        // One album per folder: the one album artist all songs share, otherwise
        // "Various Artists". Album-artist tags that differ inside the folder
        // would split it into many one-song albums, so they are unified too.
        let mut artists: Vec<String> = Vec::new();
        let mut first_spelling: Option<String> = None;
        for &i in &idx {
            let who = if tracks[i].album_artist.trim().is_empty() { &tracks[i].artist } else { &tracks[i].album_artist };
            let n = norm(who);
            if !n.is_empty() && !artists.contains(&n) {
                artists.push(n);
                if first_spelling.is_none() {
                    first_spelling = Some(who.trim().to_string());
                }
            }
        }
        if artists.len() > 1 {
            for &i in &idx {
                tracks[i].album_artist = VARIOUS_ARTISTS.into();
                tracks[i].compilation = true;
            }
        } else if let Some(one) = first_spelling {
            for &i in &idx {
                tracks[i].album_artist = one.clone();
            }
        }
    }
}

/// Tracks from the last scan of `root`, for an instant start before rescanning.
pub fn cached(root: &Path, cache_dir: &Path) -> Vec<Track> {
    let root_str = root.to_string_lossy();
    fs::read_to_string(cache_dir.join(CACHE_FILE))
        .ok()
        .and_then(|s| serde_json::from_str::<Cache>(&s).ok())
        .filter(|c| c.root == root_str)
        .map(|c| {
            let mut tracks = c.tracks;
            tracks.iter_mut().for_each(finish);
            organize_albums(&mut tracks);
            tracks
        })
        .unwrap_or_default()
}

/// Sub-folders of `dir` for the folder browser, sorted case-insensitively.
/// Hidden and system folders are left out.
pub fn list_subdirs(dir: &Path) -> Vec<String> {
    let Ok(rd) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut names: Vec<String> = rd
        .filter_map(Result::ok)
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .filter(|e| {
            let n = e.file_name().to_string_lossy().to_string();
            !n.starts_with('.') && !skip_dir(&e.path())
        })
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect();
    names.sort_by_key(|n| n.to_lowercase());
    names
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("wheeldesk-lib-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn finds_audio_but_not_wav_or_skipped_dirs() {
        let d = temp_dir("find");
        fs::create_dir_all(d.join("Album")).unwrap();
        fs::create_dir_all(d.join("node_modules")).unwrap();
        fs::create_dir_all(d.join("$RECYCLE.BIN")).unwrap();
        for f in ["Album/01.mp3", "Album/02.FLAC", "Album/03.wav", "Album/cover.jpg", "node_modules/x.mp3", "$RECYCLE.BIN/y.mp3", "top.m4a"] {
            fs::write(d.join(f), b"x").unwrap();
        }
        let mut found: Vec<String> = find_audio_files(&d)
            .into_iter()
            .map(|(p, _, _)| p.strip_prefix(&d).unwrap().to_string_lossy().replace('\\', "/"))
            .collect();
        found.sort();
        assert_eq!(found, ["Album/01.mp3", "Album/02.FLAC", "top.m4a"]);
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn untagged_file_falls_back_to_file_name() {
        let d = temp_dir("untagged");
        let p = d.join("My Song.mp3");
        fs::write(&p, b"not really audio").unwrap();
        let t = read_track(&p, 1, 16);
        assert_eq!(t.title, "My Song");
        assert!(t.artist.is_empty());
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn rescan_reuses_cache_for_unchanged_files() {
        let d = temp_dir("cache");
        let music = d.join("music");
        let cache = d.join("cache");
        fs::create_dir_all(&music).unwrap();
        fs::write(music.join("a.mp3"), b"x").unwrap();
        let first = scan(&music, Some(&cache), &|_, _| {});
        assert_eq!(first.len(), 1);
        // Pretend tags were edited in the cache; an unchanged file must keep them.
        let mut c: Cache = serde_json::from_str(&fs::read_to_string(cache.join(CACHE_FILE)).unwrap()).unwrap();
        c.tracks[0].title = "From cache".into();
        fs::write(cache.join(CACHE_FILE), serde_json::to_string(&c).unwrap()).unwrap();
        let second = scan(&music, Some(&cache), &|_, _| {});
        assert_eq!(second[0].title, "From cache");
        assert_eq!(cached(&music, &cache).len(), 1);
        fs::remove_dir_all(&d).unwrap();
    }

    fn named(file: &str, title: &str, artist: &str) -> Track {
        let mut t = read_track(Path::new("/nonexistent"), 0, 0);
        t.path = format!("/music/{file}");
        t.title = title.into();
        t.artist = artist.into();
        t
    }

    #[test]
    fn reads_replaygain_values() {
        assert_eq!(parse_gain("-6.48 dB"), Some(-6.48));
        assert_eq!(parse_gain("+2.10 dB"), Some(2.1));
        assert_eq!(parse_gain("1.5"), Some(1.5));
        assert_eq!(parse_gain("loud"), None);
    }

    #[test]
    fn takes_artist_and_number_from_file_names() {
        let cases = [
            ("001 Shayne Ward - That's My Goal.mp3", "Shayne Ward", "That's My Goal", 1),
            ("01_-_Discoteka_Avariya_-_Opa.mp3", "Discoteka Avariya", "Opa", 1),
            ("001_Julio Iglesias - Nostalgie.mp3", "Julio Iglesias", "Nostalgie", 1),
            ("12. Андрей Губин – Зима-холода.mp3", "Андрей Губин", "Зима-холода", 12),
            ("Jurga - Nebijok.mp3", "Jurga", "Nebijok", 0),
        ];
        for (file, artist, title, no) in cases {
            let stem = file.trim_end_matches(".mp3");
            let mut t = named(file, stem, "");
            infer_from_name(&mut t);
            assert_eq!((t.artist.as_str(), t.title.as_str(), t.track_no), (artist, title, no), "{file}");
        }
    }

    #[test]
    fn number_only_titles_and_tagged_artists_are_kept() {
        let mut t = named("01 Sodade.mp3", "01 Sodade", "");
        infer_from_name(&mut t);
        assert_eq!((t.title.as_str(), t.artist.as_str(), t.track_no), ("Sodade", "", 1));

        let mut t = named("99 Luftballons.mp3", "99 Luftballons", "");
        infer_from_name(&mut t);
        assert_eq!(t.title, "99 Luftballons");

        let mut t = named("01 X - Y.mp3", "Real Title", "Real Artist");
        infer_from_name(&mut t);
        assert_eq!((t.title.as_str(), t.artist.as_str()), ("Real Title", "Real Artist"));

        // Title tag of the form "Artist - Title" with no artist tag.
        let mut t = named("track.mp3", "Cesária Évora - Sodade", "");
        infer_from_name(&mut t);
        assert_eq!((t.artist.as_str(), t.title.as_str()), ("Cesária Évora", "Sodade"));
    }

    fn tr(path: &str, album: &str, artist: &str) -> Track {
        let mut t = read_track(Path::new("/nonexistent"), 0, 0);
        t.path = path.into();
        t.title = path.rsplit('/').next().unwrap().into();
        t.album = album.into();
        t.artist = artist.into();
        t
    }

    #[test]
    fn folder_with_one_album_tag_gives_it_to_untagged_songs() {
        let mut v = vec![
            tr("/m/Kino/Gruppa krovi/01.mp3", "Группа крови", "Кино"),
            tr("/m/Kino/Gruppa krovi/02.mp3", "группа крови ", "Кино"),
            tr("/m/Kino/Gruppa krovi/03.mp3", "", "Кино"),
        ];
        organize_albums(&mut v);
        assert!(v.iter().all(|t| t.album == "Группа крови"), "{:?}", v.iter().map(|t| &t.album).collect::<Vec<_>>());
        assert!(v.iter().all(|t| !t.compilation));
    }

    #[test]
    fn mixed_or_missing_album_tags_use_the_folder_name() {
        let mut v = vec![
            tr("/m/Vakarėlis 2010/a.mp3", "Hits 1", "A"),
            tr("/m/Vakarėlis 2010/b.mp3", "Hits 2", "B"),
            tr("/m/Vakarėlis 2010/c.mp3", "", "B"),
            tr("/m/Senos_dainos/x.mp3", "", ""),
            tr("/m/Senos_dainos/y.mp3", "", ""),
        ];
        organize_albums(&mut v);
        assert!(v[..3].iter().all(|t| t.album == "Vakarėlis 2010"));
        // Several artists: one album by Various Artists, not split per artist.
        assert!(v[..3].iter().all(|t| t.compilation && t.album_artist == VARIOUS_ARTISTS));
        assert!(v[3..].iter().all(|t| t.album == "Senos dainos" && !t.compilation));
    }

    #[test]
    fn differing_album_artist_tags_do_not_split_a_folder() {
        let mut v = vec![
            tr("/m/2008/a.mp3", "", "Rihanna"),
            tr("/m/2008/b.mp3", "", "Coldplay"),
            tr("/m/2008/c.mp3", "", "Madonna"),
        ];
        v[0].album_artist = "Rihanna".into();
        v[1].album_artist = "Coldplay".into();
        organize_albums(&mut v);
        assert!(v.iter().all(|t| t.album == "2008" && t.album_artist == VARIOUS_ARTISTS && t.compilation));

        // One artist (some songs with, some without the album-artist tag): one album by them.
        let mut w = vec![tr("/m/Jurga/x.mp3", "Instrukcija", "Jurga"), tr("/m/Jurga/y.mp3", "", "jurga ")];
        w[0].album_artist = "Jurga".into();
        organize_albums(&mut w);
        assert!(w.iter().all(|t| t.album == "Instrukcija" && t.album_artist == "Jurga" && !t.compilation));
    }

    #[test]
    fn disc_folders_join_the_parent_album() {
        let mut v = vec![
            tr("/m/Queen - Greatest Hits/CD1/01.mp3", "", "Queen"),
            tr("/m/Queen - Greatest Hits/CD 2/01.mp3", "", "Queen"),
        ];
        organize_albums(&mut v);
        assert_eq!(v[0].album, "Queen - Greatest Hits");
        assert_eq!(v[1].album, "Queen - Greatest Hits");
        assert_eq!((v[0].disc_no, v[1].disc_no), (1, 2));
    }

    #[test]
    fn lists_visible_subfolders_sorted() {
        let d = temp_dir("dirs");
        for n in ["b", "A", ".hidden", "node_modules"] {
            fs::create_dir_all(d.join(n)).unwrap();
        }
        fs::write(d.join("file.mp3"), b"x").unwrap();
        assert_eq!(list_subdirs(&d), ["A", "b"]);
        fs::remove_dir_all(&d).unwrap();
    }
}
