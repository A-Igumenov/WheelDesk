//! Plays files in order and prints the player state: `cargo run --example play -- a.mp3 b.flac`
use std::time::Duration;
use wheeldesk_core::{Command, Player, QueueItem};

fn main() {
    let files: Vec<String> = std::env::args().skip(1).collect();
    let player = Player::spawn(|s| {
        println!(
            "playing={} index={:?} pos={}ms dur={}ms err={:?}",
            s.playing, s.index, s.position_ms, s.duration_ms, s.error
        )
    });
    let queue = files.iter().map(|p| QueueItem { path: p.clone(), duration_ms: 0, stream: p.starts_with("http"), gain_db: None }).collect();
    player.send(Command::Load { queue, index: 0, play: true });
    std::thread::sleep(Duration::from_millis(2600 * files.len() as u64));
}
