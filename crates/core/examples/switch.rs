//! Radio → file → radio, printing every state change, to check that switching works.
use std::time::Duration;
use wheeldesk_core::{Command, Player, QueueItem};

fn main() {
    let mut args = std::env::args().skip(1);
    let url = args.next().unwrap();
    let file = args.next().unwrap();
    let t0 = std::time::Instant::now();
    let last = std::sync::Mutex::new(String::new());
    let p = Player::spawn(move |s| {
        let line = format!(
            "playing={} buffering={} idx={:?} pos={} title={:?} path={:?} err={:?}",
            s.playing, s.buffering, s.index, s.position_ms / 1000, s.stream_title, s.path.as_deref().map(|p| &p[p.len().saturating_sub(12)..]), s.error
        );
        let mut l = last.lock().unwrap();
        if *l != line {
            println!("{:5.1}s {line}", t0.elapsed().as_secs_f32());
            *l = line;
        }
    });
    let stream = || vec![QueueItem { path: url.clone(), duration_ms: 0, stream: true, gain_db: None, alternates: Vec::new() }];
    println!("--- radio");
    p.send(Command::Load { queue: stream(), index: 0, play: true });
    std::thread::sleep(Duration::from_secs(4));
    println!("--- file");
    p.send(Command::Load { queue: vec![QueueItem { path: file.clone(), duration_ms: 0, stream: false, gain_db: None, alternates: Vec::new() }], index: 0, play: true });
    std::thread::sleep(Duration::from_secs(4));
    println!("--- radio again");
    p.send(Command::Load { queue: stream(), index: 0, play: true });
    std::thread::sleep(Duration::from_secs(4));
    println!("--- pause/resume");
    p.send(Command::PlayPause);
    std::thread::sleep(Duration::from_secs(1));
    p.send(Command::PlayPause);
    std::thread::sleep(Duration::from_secs(4));
}
