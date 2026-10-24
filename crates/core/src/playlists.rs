//! Playlist files from the computer: M3U/M3U8, PLS, XSPF and WPL. Paths in
//! them may be relative, absolute, Windows-style or file:// URIs; they are
//! resolved against the playlist's own folder. Entries that do not exist are
//! returned separately, so the UI can match them to the library by name.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::library::{self, Track};

pub const PLAYLIST_EXTENSIONS: &[&str] = &["m3u", "m3u8", "pls", "xspf", "wpl"];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirListing {
    pub dirs: Vec<String>,
    pub playlists: Vec<String>,
}

/// An entry whose file was not found at the written path.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissingEntry {
    /// The path as written in the playlist.
    pub location: String,
    /// File name without folder ("Song.mp3"), for matching against the library.
    pub file_name: String,
    /// Title from the playlist itself (#EXTINF, Title1=, <title>), if any.
    pub title: String,
    pub artist: String,
    /// Position in the playlist, to keep the order when matched.
    pub position: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub path: String,
    pub name: String,
    /// Found entries, with their position in the playlist.
    pub tracks: Vec<(usize, Track)>,
    pub missing: Vec<MissingEntry>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Entry {
    pub location: String,
    pub title: String,
    pub artist: String,
}

fn is_playlist(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| PLAYLIST_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Sub-folders and playlist files of `dir`, both sorted case-insensitively.
pub fn list_dir(dir: &Path) -> DirListing {
    let dirs = library::list_subdirs(dir);
    let mut playlists: Vec<String> = fs::read_dir(dir)
        .map(|rd| {
            rd.filter_map(Result::ok)
                .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false) && is_playlist(&e.path()))
                .map(|e| e.file_name().to_string_lossy().to_string())
                .collect()
        })
        .unwrap_or_default();
    playlists.sort_by_key(|n| n.to_lowercase());
    DirListing { dirs, playlists }
}

// ------------------------------------------------------------------ parsing

fn split_artist_title(s: &str) -> (String, String) {
    for sep in [" - ", " – ", " — "] {
        if let Some((a, t)) = s.split_once(sep) {
            return (a.trim().to_string(), t.trim().to_string());
        }
    }
    (String::new(), s.trim().to_string())
}

pub fn parse_m3u(text: &str) -> Vec<Entry> {
    let mut out = Vec::new();
    let mut pending: Option<(String, String)> = None;
    for line in text.lines().map(|l| l.trim().trim_start_matches('\u{feff}')) {
        if line.is_empty() {
            continue;
        }
        if let Some(info) = line.strip_prefix("#EXTINF:") {
            // #EXTINF:123,Artist - Title
            let desc = info.split_once(',').map(|(_, d)| d).unwrap_or("");
            pending = Some(split_artist_title(desc));
        } else if !line.starts_with('#') {
            let (artist, title) = pending.take().unwrap_or_default();
            out.push(Entry { location: line.to_string(), title, artist });
        }
    }
    out
}

pub fn parse_pls(text: &str) -> Vec<Entry> {
    use std::collections::BTreeMap;
    let mut files: BTreeMap<u32, Entry> = BTreeMap::new();
    for line in text.lines().map(str::trim) {
        let Some((k, v)) = line.split_once('=') else { continue };
        let k = k.trim().to_ascii_lowercase();
        let (field, num) = if let Some(n) = k.strip_prefix("file") {
            ("file", n)
        } else if let Some(n) = k.strip_prefix("title") {
            ("title", n)
        } else {
            continue;
        };
        let Ok(n) = num.parse::<u32>() else { continue };
        let e = files.entry(n).or_default();
        if field == "file" {
            e.location = v.trim().to_string();
        } else {
            let (a, t) = split_artist_title(v);
            e.artist = a;
            e.title = t;
        }
    }
    files.into_values().filter(|e| !e.location.is_empty()).collect()
}

fn xml_unescape(s: &str) -> String {
    s.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
}

fn tag_text(block: &str, tag: &str) -> String {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    block
        .find(&open)
        .and_then(|i| {
            let rest = &block[i + open.len()..];
            rest.find(&close).map(|j| xml_unescape(rest[..j].trim()))
        })
        .unwrap_or_default()
}

pub fn parse_xspf(text: &str) -> Vec<Entry> {
    let mut out = Vec::new();
    let mut rest = text;
    while let Some(i) = rest.find("<track>").or_else(|| rest.find("<track ")) {
        let after = &rest[i..];
        let end = after.find("</track>").map(|j| j + "</track>".len()).unwrap_or(after.len());
        let block = &after[..end];
        let location = tag_text(block, "location");
        if !location.is_empty() {
            out.push(Entry { location, title: tag_text(block, "title"), artist: tag_text(block, "creator") });
        }
        rest = &after[end..];
    }
    out
}

pub fn parse_wpl(text: &str) -> Vec<Entry> {
    let mut out = Vec::new();
    let mut rest = text;
    while let Some(i) = rest.find("<media") {
        let after = &rest[i..];
        let end = after.find('>').unwrap_or(after.len());
        let tag = &after[..end];
        for q in ['"', '\''] {
            let key = format!("src={q}");
            if let Some(s) = tag.find(&key) {
                let v = &tag[s + key.len()..];
                if let Some(e) = v.find(q) {
                    out.push(Entry { location: xml_unescape(&v[..e]), ..Default::default() });
                    break;
                }
            }
        }
        rest = &after[end.max(1)..];
    }
    out
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Turns a playlist location into a path on this computer.
pub fn resolve_location(location: &str, playlist_dir: &Path) -> Option<PathBuf> {
    let loc = location.trim();
    let lower = loc.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return None; // internet entries are not files
    }
    let mut p = if lower.starts_with("file:") {
        let rest = percent_decode(&loc[5..]);
        let rest = rest.trim_start_matches('/');
        // file:///C:/Music/x.mp3 → C:/Music/x.mp3; file:///home/x.mp3 → /home/x.mp3
        if rest.len() > 1 && rest.as_bytes()[1] == b':' {
            rest.to_string()
        } else if lower.starts_with("file://localhost/") || lower.starts_with("file:///") || lower.starts_with("file:/") {
            format!("/{rest}")
        } else {
            // file://server/share/x.mp3 (network share)
            format!("//{rest}")
        }
    } else {
        loc.to_string()
    };
    if cfg!(not(windows)) {
        p = p.replace('\\', "/");
    }
    let path = PathBuf::from(&p);
    let windows_abs = p.len() > 2 && p.as_bytes()[1] == b':';
    if path.is_absolute() || (cfg!(windows) && windows_abs) || p.starts_with("//") {
        Some(path)
    } else if windows_abs {
        // A Windows path read on macOS/Linux cannot be found as written.
        None
    } else {
        Some(playlist_dir.join(path))
    }
}

fn file_name_of(location: &str) -> String {
    location.rsplit(['/', '\\']).next().map(percent_decode).unwrap_or_default()
}

fn read_text(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let bytes = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(&bytes);
    Ok(crate::text::decode_legacy_bytes(bytes))
}

pub fn parse(path: &Path, text: &str) -> Vec<Entry> {
    match path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref() {
        Some("pls") => parse_pls(text),
        Some("xspf") => parse_xspf(text),
        Some("wpl") => parse_wpl(text),
        _ => parse_m3u(text),
    }
}

/// Reads a playlist file; found songs come with their tags, others as `missing`.
pub fn read(path: &Path) -> Result<Playlist, String> {
    let text = read_text(path)?;
    let dir = path.parent().unwrap_or(Path::new("."));
    let mut tracks = Vec::new();
    let mut missing = Vec::new();
    for (pos, e) in parse(path, &text).into_iter().enumerate() {
        let found = resolve_location(&e.location, dir).filter(|p| p.is_file());
        match found {
            Some(p) => {
                let meta = fs::metadata(&p).ok();
                let mtime = meta
                    .as_ref()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let mut t = library::read_track(&p, mtime, meta.map(|m| m.len()).unwrap_or(0));
                if t.artist.is_empty() && !e.artist.is_empty() {
                    t.artist = crate::text::fix_legacy(&e.artist);
                }
                tracks.push((pos, t));
            }
            None if e.location.to_ascii_lowercase().starts_with("http") => {}
            None => missing.push(MissingEntry {
                file_name: file_name_of(&e.location),
                location: e.location,
                title: crate::text::fix_legacy(&e.title),
                artist: crate::text::fix_legacy(&e.artist),
                position: pos,
            }),
        }
    }
    let name = path.file_stem().map(|s| crate::text::fix_legacy(&s.to_string_lossy())).unwrap_or_default();
    Ok(Playlist { path: path.to_string_lossy().to_string(), name, tracks, missing })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_m3u_with_extinf() {
        let e = parse_m3u("\u{feff}#EXTM3U\n#EXTINF:215,Jurga - Nebijok\nMusic\\Jurga\\01.mp3\n\n#EXTINF:-1,\nfile:///C:/x/y.mp3\nplain.flac\n");
        assert_eq!(e.len(), 3);
        assert_eq!((e[0].artist.as_str(), e[0].title.as_str(), e[0].location.as_str()), ("Jurga", "Nebijok", "Music\\Jurga\\01.mp3"));
        assert_eq!(e[2].location, "plain.flac");
        assert!(e[2].title.is_empty());
    }

    #[test]
    fn parses_pls_in_number_order() {
        let e = parse_pls("[playlist]\nFile2=b.mp3\nTitle2=B - Two\nFile1=a.mp3\nNumberOfEntries=2\nVersion=2\n");
        assert_eq!(e.iter().map(|x| x.location.as_str()).collect::<Vec<_>>(), ["a.mp3", "b.mp3"]);
        assert_eq!((e[1].artist.as_str(), e[1].title.as_str()), ("B", "Two"));
    }

    #[test]
    fn parses_xspf_and_wpl() {
        let x = r#"<?xml version="1.0"?><playlist><trackList>
          <track><location>file:///home/u/Music/A%20B.mp3</location><title>Song &amp; Co</title><creator>Band</creator></track>
          <track><location>rel/c.ogg</location></track></trackList></playlist>"#;
        let e = parse_xspf(x);
        assert_eq!(e.len(), 2);
        assert_eq!((e[0].title.as_str(), e[0].artist.as_str()), ("Song & Co", "Band"));
        let w = r#"<smil><body><seq><media src="..\Music\a.mp3"/><media src='D:\b.wma' tid="x"/></seq></body></smil>"#;
        assert_eq!(parse_wpl(w).iter().map(|x| x.location.as_str()).collect::<Vec<_>>(), ["..\\Music\\a.mp3", "D:\\b.wma"]);
    }

    #[test]
    fn resolves_locations() {
        let dir = Path::new("/lists");
        assert_eq!(resolve_location("a/b.mp3", dir), Some(PathBuf::from("/lists/a/b.mp3")));
        assert_eq!(resolve_location("file:///home/u/A%20B.mp3", dir), Some(PathBuf::from("/home/u/A B.mp3")));
        assert_eq!(resolve_location("http://radio/x", dir), None);
        if cfg!(not(windows)) {
            assert_eq!(resolve_location("..\\Music\\a.mp3", dir), Some(PathBuf::from("/lists/../Music/a.mp3")));
            assert_eq!(resolve_location("C:\\Music\\a.mp3", dir), None);
            assert_eq!(resolve_location("/abs/x.mp3", dir), Some(PathBuf::from("/abs/x.mp3")));
        }
    }

    #[test]
    fn reads_found_and_missing_entries_in_order() {
        let root = std::env::temp_dir().join(format!("wheeldesk-pl-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("Music")).unwrap();
        fs::create_dir_all(root.join("Lists")).unwrap();
        fs::write(root.join("Music/01 Jurga - Nebijok.mp3"), b"x").unwrap();
        // Windows-1251 playlist text (old Winamp list).
        let body = "#EXTM3U\r\n#EXTINF:1,Кино - Кукушка\r\nC:\\Old\\kukushka.mp3\r\n..\\Music\\01 Jurga - Nebijok.mp3\r\n";
        let (bytes, _, _) = encoding_rs::WINDOWS_1251.encode(body);
        fs::write(root.join("Lists/Mėgstamos.m3u"), &bytes).unwrap();

        let ls = list_dir(&root.join("Lists"));
        assert_eq!(ls.playlists, ["Mėgstamos.m3u"]);

        let pl = read(&root.join("Lists/Mėgstamos.m3u")).unwrap();
        assert_eq!(pl.name, "Mėgstamos");
        assert_eq!(pl.tracks.len(), 1);
        assert_eq!(pl.tracks[0].0, 1);
        assert_eq!((pl.tracks[0].1.artist.as_str(), pl.tracks[0].1.title.as_str()), ("Jurga", "Nebijok"));
        if cfg!(not(windows)) {
            assert_eq!(pl.missing.len(), 1);
            assert_eq!(pl.missing[0].file_name, "kukushka.mp3");
            assert_eq!((pl.missing[0].artist.as_str(), pl.missing[0].title.as_str()), ("Кино", "Кукушка"));
            assert_eq!(pl.missing[0].position, 0);
        }
        fs::remove_dir_all(&root).unwrap();
    }
}
