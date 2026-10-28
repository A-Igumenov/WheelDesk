//! User settings, stored as JSON in the per-OS config directory:
//! Windows `%APPDATA%\Igumenov\WheelDesk\config`, macOS
//! `~/Library/Application Support/lt.Igumenov.WheelDesk`, Linux `~/.config/wheeldesk`.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

const FILE_NAME: &str = "settings.json";

/// Where the music library lives: a volume (by stable id) and a folder inside it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySource {
    pub volume_id: String,
    /// Relative to the volume's mount point, with `/` separators. Empty = whole volume.
    #[serde(default)]
    pub relative_path: String,
}

/// A playlist made on the player (On-The-Go saved as "New Playlist 1"...).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedPlaylist {
    pub name: String,
    pub paths: Vec<String>,
}

/// One stopwatch session: when it started (ms since 1970) and its laps (ms).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StopwatchLog {
    pub started: u64,
    pub laps: Vec<u64>,
}

/// One played song (or a song heard on a radio station).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct HistoryEntry {
    /// When it started, ms since 1970.
    pub at: u64,
    /// File path, or the stream address for radio.
    pub path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    /// Radio station name; empty for songs from the library.
    pub station: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub language: String,
    pub shuffle: String,
    pub repeat: String,
    pub eq_preset: String,
    pub clicker: bool,
    pub sound_check: bool,
    pub crossfade: bool,
    /// 0 = always on.
    pub backlight_secs: u32,
    /// Playback volume 0.0 – 1.0.
    pub volume: f32,
    /// Menus can also be clicked with the mouse (off by default, like the original).
    pub mouse_control: bool,
    /// Playlist files imported from the computer (read again each time they are opened).
    pub playlists: Vec<String>,
    /// The On-The-Go list (file paths, in order).
    pub on_the_go: Vec<String>,
    pub saved_playlists: Vec<SavedPlaylist>,
    pub stopwatch_logs: Vec<StopwatchLog>,
    /// Played songs, newest first (kept to a few hundred).
    pub history: Vec<HistoryEntry>,
    /// World clocks: IANA time zones ("Europe/Vilnius"); empty = this computer's zone.
    pub clocks: Vec<String>,
    pub library_source: Option<LibrarySource>,
    /// Settings that only the UI uses (alarms, screen lock, menu choices...).
    /// Kept as they are, so new UI settings need no change here.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: "en".into(),
            shuffle: "off".into(),
            repeat: "off".into(),
            eq_preset: "Off".into(),
            clicker: true,
            sound_check: false,
            crossfade: false,
            backlight_secs: 10,
            volume: 0.7,
            mouse_control: false,
            playlists: Vec::new(),
            on_the_go: Vec::new(),
            saved_playlists: Vec::new(),
            stopwatch_logs: Vec::new(),
            history: Vec::new(),
            clocks: Vec::new(),
            library_source: None,
            extra: serde_json::Map::new(),
        }
    }
}

/// Default config directory for this OS.
pub fn config_dir() -> Option<PathBuf> {
    directories::ProjectDirs::from("lt", "Igumenov", "WheelDesk").map(|d| d.config_dir().to_path_buf())
}

/// Default cache directory (library index, downloaded artwork) for this OS.
pub fn cache_dir() -> Option<PathBuf> {
    directories::ProjectDirs::from("lt", "Igumenov", "WheelDesk").map(|d| d.cache_dir().to_path_buf())
}

impl Settings {
    /// Loads settings; a missing or corrupt file gives defaults rather than an error,
    /// so a broken file never stops the player from starting.
    pub fn load(dir: &Path) -> Self {
        fs::read_to_string(dir.join(FILE_NAME))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    /// Writes atomically (temp file + rename) so a crash cannot leave half a file.
    pub fn save(&self, dir: &Path) -> io::Result<()> {
        fs::create_dir_all(dir)?;
        let tmp = dir.join(format!("{FILE_NAME}.tmp"));
        let json = serde_json::to_string_pretty(self).map_err(io::Error::other)?;
        fs::write(&tmp, json)?;
        fs::rename(&tmp, dir.join(FILE_NAME))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("wheeldesk-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn round_trip_keeps_library_source() {
        let dir = temp_dir("roundtrip");
        let s = Settings {
            eq_preset: "Rock".into(),
            library_source: Some(LibrarySource { volume_id: "uuid:1234".into(), relative_path: "Music/Flac".into() }),
            ..Settings::default()
        };
        s.save(&dir).unwrap();
        assert_eq!(Settings::load(&dir), s);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn missing_or_corrupt_file_gives_defaults() {
        let dir = temp_dir("corrupt");
        assert_eq!(Settings::load(&dir), Settings::default());
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), "{not json").unwrap();
        assert_eq!(Settings::load(&dir), Settings::default());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn unknown_and_missing_fields_are_tolerated() {
        let s: Settings = serde_json::from_str(r#"{"eqPreset":"Jazz","futureField":1}"#).unwrap();
        assert_eq!(s.eq_preset, "Jazz");
        assert!(s.clicker);
    }

    #[test]
    fn keeps_settings_it_does_not_know() {
        let dir = temp_dir("extra");
        let s: Settings = serde_json::from_str(r#"{"eqPreset":"Jazz","alarms":[{"id":1,"hour":7}],"lockCode":"1234","locked":true}"#).unwrap();
        assert_eq!(s.extra["lockCode"], "1234");
        s.save(&dir).unwrap();
        let back = Settings::load(&dir);
        assert_eq!(back.extra["alarms"][0]["hour"], 7);
        assert_eq!(back.extra["locked"], true);
        assert_eq!(back.eq_preset, "Jazz");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn uses_camel_case_for_the_ui() {
        let json = serde_json::to_string(&Settings::default()).unwrap();
        assert!(json.contains("\"librarySource\":null"));
        assert!(json.contains("\"backlightSecs\":10"));
        assert!(json.contains("\"mouseControl\":false"));
        assert!(json.contains("\"onTheGo\":[]"));
        assert!(json.contains("\"stopwatchLogs\":[]"));
    }
}
