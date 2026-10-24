//! Plays a stream URL and prints state changes: `cargo run --example radio -- http://host/stream`
use std::time::Duration;
use wheeldesk_core::{Command, Player, QueueItem};

fn main() {
    let url = std::env::args().nth(1).expect("stream url");
    let secs: u64 = std::env::args().nth(2).and_then(|s| s.parse().ok()).unwrap_or(8);
    let last = std::sync::Mutex::new(String::new());
    let player = Player::spawn(move |s| {
        let line = format!("playing={} buffering={} title={:?} err={:?}", s.playing, s.buffering, s.stream_title, s.error);
        let mut l = last.lock().unwrap();
        if *l != line {
            println!("{line}");
            *l = line;
        }
    });
    player.send(Command::Load { queue: vec![QueueItem { path: url, duration_ms: 0, stream: true, gain_db: None }], index: 0, play: true });
    std::thread::sleep(Duration::from_secs(secs));
}
