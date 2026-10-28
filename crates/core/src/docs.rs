//! Text documents for Extras: notes (.txt, .md) and calendars (.ics).
//! Listing a folder and reading a file as text, whatever its encoding.

use std::fs;
use std::io::Read;
use std::path::Path;

use serde::Serialize;

use crate::library;

/// Files larger than this are cut (a note is meant to be read on a small screen).
pub const MAX_TEXT_BYTES: u64 = 512 * 1024;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct FileListing {
    pub dirs: Vec<String>,
    pub files: Vec<String>,
}

/// Sub-folders and the files with one of `exts` (lower case, no dot).
pub fn list_files(dir: &Path, exts: &[String]) -> FileListing {
    let dirs = library::list_subdirs(dir);
    let mut files: Vec<String> = fs::read_dir(dir)
        .map(|rd| {
            rd.filter_map(Result::ok)
                .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
                .filter(|e| {
                    let ext = e.path().extension().map(|x| x.to_string_lossy().to_lowercase()).unwrap_or_default();
                    exts.iter().any(|x| *x == ext)
                })
                .map(|e| e.file_name().to_string_lossy().to_string())
                .filter(|n| !n.starts_with('.'))
                .collect()
        })
        .unwrap_or_default();
    files.sort_by_key(|n| n.to_lowercase());
    FileListing { dirs, files }
}

/// Files with one of `exts` anywhere under `dir` (Photos: all photos of an
/// album folder), full paths sorted, at most `limit`.
pub fn find_files(dir: &Path, exts: &[String], limit: usize) -> Vec<String> {
    let mut out: Vec<String> = walkdir::WalkDir::new(dir)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| e.depth() == 0 || !(e.file_type().is_dir() && (library::skip_dir(e.path()) || e.file_name().to_string_lossy().starts_with('.'))))
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file() && !e.file_name().to_string_lossy().starts_with('.'))
        .filter(|e| {
            let ext = e.path().extension().map(|x| x.to_string_lossy().to_lowercase()).unwrap_or_default();
            exts.iter().any(|x| *x == ext)
        })
        .take(limit)
        .map(|e| e.path().to_string_lossy().to_string())
        .collect();
    out.sort_by_key(|p| p.to_lowercase());
    out
}

/// Reads a text file: UTF-8 (with or without BOM), UTF-16 with BOM, or an
/// old Windows code page.
pub fn read_text(path: &Path) -> Result<String, String> {
    let f = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    f.take(MAX_TEXT_BYTES).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    Ok(decode_text(&bytes))
}

pub fn decode_text(bytes: &[u8]) -> String {
    if let Some(rest) = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8_lossy(rest).into_owned();
    }
    let utf16 = |b: &[u8], le: bool| {
        let units: Vec<u16> = b
            .chunks_exact(2)
            .map(|c| if le { u16::from_le_bytes([c[0], c[1]]) } else { u16::from_be_bytes([c[0], c[1]]) })
            .collect();
        String::from_utf16_lossy(&units)
    };
    if let Some(rest) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        return utf16(rest, true);
    }
    if let Some(rest) = bytes.strip_prefix(&[0xFE, 0xFF]) {
        return utf16(rest, false);
    }
    match std::str::from_utf8(bytes) {
        Ok(s) => s.to_string(),
        // A cut file may end in the middle of a character.
        Err(e) if e.error_len().is_none() && e.valid_up_to() + 4 > bytes.len() => {
            String::from_utf8_lossy(&bytes[..e.valid_up_to()]).into_owned()
        }
        Err(_) => crate::text::decode_legacy_bytes(bytes),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_common_encodings() {
        assert_eq!(decode_text("Labas, ąčę".as_bytes()), "Labas, ąčę");
        assert_eq!(decode_text(b"\xEF\xBB\xBFHi"), "Hi");
        assert_eq!(decode_text(&[0xFF, 0xFE, b'H', 0, b'i', 0]), "Hi");
        // "Привет" in Windows-1251.
        assert_eq!(decode_text(&[0xCF, 0xF0, 0xE8, 0xE2, 0xE5, 0xF2]), "Привет");
    }

    #[test]
    fn lists_only_the_wanted_files() {
        let dir = std::env::temp_dir().join(format!("wd-docs-{}", std::process::id()));
        fs::create_dir_all(dir.join("Sub")).unwrap();
        for n in ["b.txt", "A.md", "c.mp3", "d.ics", ".hidden.txt"] {
            fs::write(dir.join(n), "x").unwrap();
        }
        let l = list_files(&dir, &["txt".into(), "md".into()]);
        assert_eq!(l.files, vec!["A.md", "b.txt"]);
        assert_eq!(l.dirs, vec!["Sub"]);
        fs::write(dir.join("Sub").join("p.JPG"), "x").unwrap();
        fs::write(dir.join("a.png"), "x").unwrap();
        let found = find_files(&dir, &["jpg".into(), "png".into()], 10);
        assert_eq!(found.len(), 2);
        assert!(found[0].ends_with("a.png") && found[1].ends_with("p.JPG"));
        fs::remove_dir_all(&dir).unwrap();
    }
}
