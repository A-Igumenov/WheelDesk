//! Album artwork, in order: picture embedded in the file, an image in the
//! album folder, then open online sources by album (MusicBrainz / Cover Art
//! Archive, TheAudioDB, Wikipedia — see `covers`).
//! Online results are cached on disk, including "nothing found", so each
//! album is looked up at most once a week.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use base64::Engine;
use lofty::picture::PictureType;
use lofty::prelude::*;

const MAX_IMAGE_BYTES: u64 = 8 * 1024 * 1024;
const NEGATIVE_TTL: Duration = Duration::from_secs(7 * 24 * 3600);

#[derive(Debug, Clone, PartialEq)]
pub struct Art {
    pub mime: String,
    pub bytes: Vec<u8>,
}

impl Art {
    pub fn data_url(&self) -> String {
        format!("data:{};base64,{}", self.mime, base64::engine::general_purpose::STANDARD.encode(&self.bytes))
    }
}

fn mime_from_bytes(b: &[u8]) -> Option<&'static str> {
    match b {
        [0xFF, 0xD8, ..] => Some("image/jpeg"),
        [0x89, b'P', b'N', b'G', ..] => Some("image/png"),
        [b'G', b'I', b'F', ..] => Some("image/gif"),
        [b'R', b'I', b'F', b'F', _, _, _, _, b'W', b'E', b'B', b'P', ..] => Some("image/webp"),
        _ => None,
    }
}

fn art_from_bytes(bytes: Vec<u8>) -> Option<Art> {
    let mime = mime_from_bytes(&bytes)?;
    Some(Art { mime: mime.into(), bytes })
}

/// Front cover embedded in the audio file (or the first picture if none is marked).
pub fn embedded(path: &Path) -> Option<Art> {
    let tagged = lofty::read_from_path(path).ok()?;
    let pictures: Vec<_> = tagged.tags().iter().flat_map(|t| t.pictures().iter()).collect();
    let pic = pictures
        .iter()
        .find(|p| p.pic_type() == PictureType::CoverFront)
        .or_else(|| pictures.first())?;
    art_from_bytes(pic.data().to_vec())
}

/// cover.jpg / folder.png / front.jpg ... next to the file; otherwise the only image there.
pub fn from_folder(path: &Path) -> Option<Art> {
    let dir = path.parent()?;
    let images: Vec<PathBuf> = fs::read_dir(dir)
        .ok()?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| {
            p.extension()
                .and_then(|e| e.to_str())
                .map(|e| matches!(e.to_ascii_lowercase().as_str(), "jpg" | "jpeg" | "png" | "webp"))
                .unwrap_or(false)
        })
        .collect();
    let preferred = ["cover", "folder", "front", "album", "albumart", "albumartsmall"];
    let pick = images
        .iter()
        .find(|p| {
            let stem = p.file_stem().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default();
            preferred.iter().any(|n| stem == *n || stem.starts_with(&format!("{n}_")))
        })
        .or(if images.len() == 1 { images.first() } else { None })?;
    let meta = fs::metadata(pick).ok()?;
    if meta.len() > MAX_IMAGE_BYTES {
        return None;
    }
    art_from_bytes(fs::read(pick).ok()?)
}

/// Local artwork only: embedded first, then the folder.
pub fn local(path: &Path) -> Option<Art> {
    embedded(path).or_else(|| from_folder(path))
}

fn cache_key(artist: &str, album: &str) -> String {
    // FNV-1a: stable across Rust versions, unlike DefaultHasher.
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in format!("{}\u{1f}{}", artist.trim().to_lowercase(), album.trim().to_lowercase()).bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{h:016x}")
}

fn download(agent: &ureq::Agent, url: &str) -> Option<Art> {
    let mut bytes = Vec::new();
    agent.get(url).call().ok()?.into_reader().take(MAX_IMAGE_BYTES).read_to_end(&mut bytes).ok()?;
    art_from_bytes(bytes)
}

fn norm(s: &str) -> String {
    let s = s.to_lowercase();
    let s = s.strip_prefix("the ").unwrap_or(&s);
    s.chars().filter(|c| c.is_alphanumeric()).collect()
}

/// 3 = same, 2 = one starts with the other ("Album (Deluxe)"), 1 = contains, 0 = different.
pub(crate) fn match_score(a: &str, b: &str) -> u8 {
    let (a, b) = (norm(a), norm(b));
    if a.is_empty() || b.is_empty() {
        0
    } else if a == b {
        3
    } else if a.starts_with(&b) || b.starts_with(&a) {
        2
    } else if a.contains(&b) || b.contains(&a) {
        1
    } else {
        0
    }
}

#[cfg(test)]
fn similar(a: &str, b: &str) -> bool {
    match_score(a, b) > 0
}

/// Online artwork for an album, cached in `cache_dir`. Returns None for
/// unknown artist/album: guessing from a bare title gives wrong covers.
pub fn online(artist: &str, album: &str, cache_dir: &Path) -> Option<Art> {
    if artist.trim().is_empty() || album.trim().is_empty() {
        return None;
    }
    let dir = cache_dir.join("artwork");
    let key = cache_key(artist, album);
    let hit = dir.join(format!("{key}.img"));
    let miss = dir.join(format!("{key}.none"));

    if let Ok(bytes) = fs::read(&hit) {
        return art_from_bytes(bytes);
    }
    if let Ok(meta) = fs::metadata(&miss) {
        let fresh = meta
            .modified()
            .ok()
            .and_then(|m| SystemTime::now().duration_since(m).ok())
            .map(|age| age < NEGATIVE_TTL)
            .unwrap_or(true);
        if fresh {
            return None;
        }
    }

    let agent = crate::covers::agent();
    let found = crate::covers::album(&agent, artist, album, |u| download(&agent, u));

    let _ = fs::create_dir_all(&dir);
    match &found {
        Some(art) => {
            let _ = fs::write(&hit, &art.bytes);
            let _ = fs::remove_file(&miss);
        }
        None => {
            let _ = fs::write(&miss, b"");
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG_1PX: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00,
        0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89,
    ];

    fn temp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("wheeldesk-art-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn finds_cover_file_in_album_folder() {
        let d = temp_dir("folder");
        fs::write(d.join("01.mp3"), b"x").unwrap();
        fs::write(d.join("back.jpg"), [0xFF, 0xD8, 0x00]).unwrap();
        fs::write(d.join("Cover.PNG"), PNG_1PX).unwrap();
        let art = from_folder(&d.join("01.mp3")).unwrap();
        assert_eq!(art.mime, "image/png");
        assert!(art.data_url().starts_with("data:image/png;base64,"));
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn ignores_ambiguous_folders_and_non_images() {
        let d = temp_dir("ambiguous");
        fs::write(d.join("01.mp3"), b"x").unwrap();
        fs::write(d.join("a.jpg"), [0xFF, 0xD8, 0x00]).unwrap();
        fs::write(d.join("b.jpg"), [0xFF, 0xD8, 0x00]).unwrap();
        assert!(from_folder(&d.join("01.mp3")).is_none());
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn cached_online_lookups_need_no_network() {
        let d = temp_dir("cache");
        let dir = d.join("artwork");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(format!("{}.img", cache_key("Band", "Record"))), PNG_1PX).unwrap();
        fs::write(dir.join(format!("{}.none", cache_key("Nobody", "Nothing"))), b"").unwrap();
        assert!(online("band ", "RECORD", &d).is_some());
        assert!(online("Nobody", "Nothing", &d).is_none());
        assert!(online("", "Album", &d).is_none());
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn matching_tolerates_punctuation_and_editions() {
        assert!(similar("Loose (Deluxe Edition)", "loose"));
        assert!(similar("AC/DC", "acdc"));
        assert!(!similar("Abbey Road", "Let It Be"));
    }

}
