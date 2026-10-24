//! End-to-end checks on real (tiny, generated) audio files: every supported
//! format is found, its tags are read, and it decodes.

use std::path::PathBuf;

use wheeldesk_core::{art, library, player};

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures")
}

#[test]
fn scans_all_formats_with_tags() {
    let tracks = library::scan(&fixtures(), None, &|_, _| {});
    let names: Vec<_> = tracks
        .iter()
        .map(|t| PathBuf::from(&t.path).file_name().unwrap().to_string_lossy().to_string())
        .collect();
    assert_eq!(names, ["a.mp3", "b.flac", "c.m4a", "d.ogg", "e.aiff"]);

    let a = &tracks[0];
    assert_eq!(a.title, "Sine A");
    assert_eq!(a.artist, "Test Artist");
    // The folder holds songs from two albums, so the folder name is the album.
    assert_eq!(a.album, "fixtures");
    assert_eq!(library::read_track(std::path::Path::new(&a.path), 0, 0).album, "Test Album");
    // Two artists in one folder: one album by Various Artists.
    assert_eq!(a.album_artist, "Various Artists");
    assert_eq!(a.genre, "Electronic");
    assert_eq!(a.composer, "J. Composer");
    assert_eq!(a.track_no, 1);
    assert_eq!(a.year, 2024);
    assert!((1800..2300).contains(&a.duration_ms), "duration {}", a.duration_ms);

    assert_eq!(tracks[1].title, "Sine B");
    assert_eq!(tracks[1].track_no, 2);
    assert_eq!(tracks[2].album, "fixtures");
    assert_eq!(tracks[3].artist, "Other Artist");
    // No tags at all: title comes from the file name.
    assert_eq!(tracks[4].title, "e");
}

#[test]
fn every_supported_format_decodes() {
    for name in ["a.mp3", "b.flac", "c.m4a", "d.ogg", "e.aiff"] {
        let path = fixtures().join(name);
        let result = player::can_decode(&path.to_string_lossy());
        assert!(result.is_ok(), "{name}: {:?}", result.err());
    }
}

#[test]
fn reads_embedded_cover() {
    let art = art::local(&fixtures().join("a.mp3")).expect("embedded cover");
    assert!(art.mime.starts_with("image/"));
    assert!(art::local(&fixtures().join("b.flac")).is_none());
}

#[test]
fn player_loads_queue_with_or_without_audio_device() {
    use std::sync::mpsc;
    use std::time::Duration;
    use wheeldesk_core::{Command, Player, QueueItem};

    let (tx, rx) = mpsc::channel();
    let player = Player::spawn(move |s| {
        let _ = tx.send(s.clone());
    });
    let queue: Vec<QueueItem> = ["a.mp3", "c.m4a"]
        .iter()
        .map(|n| QueueItem { path: fixtures().join(n).to_string_lossy().to_string(), duration_ms: 0, stream: false, gain_db: None })
        .collect();
    player.send(Command::Load { queue, index: 1, play: false });

    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    loop {
        let s = rx.recv_timeout(Duration::from_secs(5)).expect("player state");
        if s.queue_len == 2 {
            assert_eq!(s.index, Some(1));
            assert!(s.path.unwrap().ends_with("c.m4a"));
            assert!(!s.playing);
            break;
        }
        assert!(std::time::Instant::now() < deadline, "queue never loaded");
    }
}

#[test]
fn russian_id3v1_tags_in_windows_1251_are_repaired() {
    // Old MP3: no ID3v2, an ID3v1 tag whose text is Windows-1251 bytes.
    let src = std::fs::read(fixtures().join("a.mp3")).unwrap();
    let id3v2_len = if &src[..3] == b"ID3" {
        10 + (((src[6] as usize) << 21) | ((src[7] as usize) << 14) | ((src[8] as usize) << 7) | src[9] as usize)
    } else {
        0
    };
    let mut data = src[id3v2_len..].to_vec();
    let field = |s: &str, n: usize| {
        let mut b = encoding_rs::WINDOWS_1251.encode(s).0.into_owned();
        b.resize(n, 0);
        b
    };
    data.extend(b"TAG");
    data.extend(field("Зимняя вишня", 30));
    data.extend(field("Наташа Королёва", 30));
    data.extend(field("Хиты", 30));
    data.extend(field("1995", 4));
    data.extend(field("", 30));
    data.push(255);

    let dir = std::env::temp_dir().join(format!("wheeldesk-cp1251-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("old.mp3");
    std::fs::write(&path, &data).unwrap();
    let t = library::read_track(&path, 0, data.len() as u64);
    std::fs::remove_dir_all(&dir).unwrap();
    assert_eq!(t.title, "Зимняя вишня");
    assert_eq!(t.artist, "Наташа Королёва");
    assert_eq!(t.album, "Хиты");
}

#[test]
fn every_format_goes_through_the_equaliser_and_sound_check() {
    use std::sync::Arc;
    use wheeldesk_core::dsp::{analyze_loudness, Dsp, EqControl, Level};
    for name in ["a.mp3", "b.flac", "c.m4a", "d.ogg", "e.aiff"] {
        let path = fixtures().join(name);
        let p = path.to_string_lossy().to_string();
        let open = || wheeldesk_core::player::open_decoder(&p).unwrap();
        let eq = Arc::new(EqControl::default());
        eq.set([6.0, 4.0, 2.0, 0.0, -2.0, 0.0, 2.0, 4.0, 6.0, 3.0]);
        let n = Dsp::new(open(), eq, Level::new(-3.0)).filter(|s| s.is_finite() && s.abs() <= 1.0).count();
        assert!(n > 1000, "{name}: {n} samples");
        let g = analyze_loudness(open(), 600);
        assert!(g.is_some(), "{name}: no loudness");
    }
}
