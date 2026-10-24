//! Audio playback on its own thread. The UI sends commands; the player reports
//! its state through a callback (about four times a second while playing).
//! Queue rules follow the original device: "previous" restarts the song after
//! three seconds, repeat-one still lets the user skip, and files that cannot be
//! decoded are skipped.

use std::fs::File;
use std::io::BufReader;
use std::panic::{self, AssertUnwindSafe};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::thread;
use std::cell::Cell;
use std::time::{Duration, Instant};

use rodio::decoder::DecoderBuilder;
use rodio::{Decoder, OutputStream, OutputStreamBuilder, Sink, Source};
use serde::{Deserialize, Serialize};

use crate::dsp::{self, Dsp, EqControl, Level};

const TICK: Duration = Duration::from_millis(250);
const RESTART_THRESHOLD_MS: u64 = 3000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueItem {
    /// File path, or the stream URL for internet radio.
    pub path: String,
    #[serde(default)]
    pub duration_ms: u64,
    /// Live internet stream (no duration, no seeking, reconnects on drop-outs).
    #[serde(default)]
    pub stream: bool,
    /// Sound Check level from the file's ReplayGain tag, if it has one.
    #[serde(default)]
    pub gain_db: Option<f32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Repeat {
    #[default]
    Off,
    One,
    All,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PlayerState {
    pub playing: bool,
    pub index: Option<usize>,
    pub queue_len: usize,
    pub position_ms: u64,
    pub duration_ms: u64,
    /// 0.0 – 1.0, as shown on the volume bar.
    pub volume: f32,
    pub path: Option<String>,
    /// Last problem (no audio device, unreadable file), for the UI to show.
    pub error: Option<String>,
    /// Live stream: connecting / buffering.
    pub buffering: bool,
    /// Live stream: the latest "Artist - Title" sent by the station.
    pub stream_title: Option<String>,
}

pub enum Command {
    Load { queue: Vec<QueueItem>, index: usize, play: bool },
    PlayPause,
    Pause,
    Next,
    Prev,
    SeekTo(u64),
    SeekBy(i64),
    Volume(f32),
    SetRepeat(Repeat),
    Stop,
    /// Internal: a stream finished connecting (generation, result).
    StreamOpened(u64, Result<crate::stream::Live, String>),
    /// Equaliser band gains in dB (see `dsp::BANDS`).
    SetEq([f32; 10]),
    SoundCheck(bool),
    Crossfade(bool),
    /// Internal: a song's loudness was measured (path, gain in dB).
    Measured(String, Option<f32>),
}

/// How many times a dropped stream is reconnected before giving up.
const STREAM_RETRIES: u32 = 5;

/// Audio Crossfade: the end of one song fades into the start of the next.
const FADE: Duration = Duration::from_secs(6);
/// Fades never go below this (dB) — the old sink is stopped right after.
const SILENT_DB: f32 = -60.0;

/// The song that is fading out while the next one fades in.
struct Fade {
    old_sink: Sink,
    old_level: Arc<Level>,
    old_db: f32,
    started: Instant,
}

/// Index after the current one. `user` = the user pressed "next" (repeat-one
/// does not hold them on the same song); otherwise the song simply ended.
pub fn next_index(index: usize, len: usize, repeat: Repeat, user: bool) -> Option<usize> {
    if len == 0 {
        return None;
    }
    if repeat == Repeat::One && !user {
        return Some(index);
    }
    if index + 1 < len {
        Some(index + 1)
    } else if repeat == Repeat::All || (repeat == Repeat::One && user) {
        Some(0)
    } else {
        None
    }
}

pub enum PrevAction {
    Restart,
    Go(usize),
}

/// "Previous": restart the song if it has played a while, else go back one.
pub fn prev_action(index: usize, len: usize, position_ms: u64, repeat: Repeat) -> PrevAction {
    if position_ms > RESTART_THRESHOLD_MS || len == 0 {
        PrevAction::Restart
    } else if index > 0 {
        PrevAction::Go(index - 1)
    } else if repeat == Repeat::All {
        PrevAction::Go(len - 1)
    } else {
        PrevAction::Restart
    }
}

pub struct Player {
    tx: Sender<Command>,
}

impl Player {
    pub fn spawn<F>(on_state: F) -> Self
    where
        F: Fn(&PlayerState) + Send + 'static,
    {
        let (tx, rx) = mpsc::channel::<Command>();
        let own = tx.clone();
        thread::Builder::new()
            .name("wheeldesk-player".into())
            .spawn(move || Engine::new(Box::new(on_state), own).run(rx))
            .expect("start player thread");
        Self { tx }
    }

    pub fn send(&self, cmd: Command) {
        let _ = self.tx.send(cmd);
    }
}

struct Engine {
    on_state: Box<dyn Fn(&PlayerState) + Send>,
    /// Open audio device; None when the computer has no usable output.
    stream: Option<OutputStream>,
    sink: Option<Sink>,
    queue: Vec<QueueItem>,
    repeat: Repeat,
    state: PlayerState,
    /// For connecting streams in the background and reporting back.
    own_tx: Sender<Command>,
    /// Bumped on every start; stale stream connections are ignored.
    generation: u64,
    stream_title: Option<Arc<Mutex<Option<String>>>>,
    stream_stop: Option<Arc<AtomicBool>>,
    retries: u32,
    eq: Arc<EqControl>,
    /// Level of the playing song (Sound Check).
    level: Arc<Level>,
    sound_check: bool,
    /// Measured Sound Check gains by path (None = could not be measured).
    measured: HashMap<String, Option<f32>>,
    measuring: HashSet<String>,
    crossfade: bool,
    fade: Option<Fade>,
    last_emit: Cell<Instant>,
}

impl Engine {
    fn new(on_state: Box<dyn Fn(&PlayerState) + Send>, own_tx: Sender<Command>) -> Self {
        let (stream, error) = match OutputStreamBuilder::open_default_stream() {
            Ok(mut s) => {
                s.log_on_drop(false);
                (Some(s), None)
            }
            Err(e) => (None, Some(format!("No audio output: {e}"))),
        };
        Self {
            on_state,
            stream,
            sink: None,
            queue: Vec::new(),
            repeat: Repeat::Off,
            state: PlayerState { volume: 0.7, error, ..Default::default() },
            own_tx,
            generation: 0,
            stream_title: None,
            stream_stop: None,
            retries: 0,
            eq: Arc::new(EqControl::default()),
            level: Level::new(0.0),
            sound_check: false,
            measured: HashMap::new(),
            measuring: HashSet::new(),
            crossfade: false,
            fade: None,
            last_emit: Cell::new(Instant::now()),
        }
    }

    /// Starts the crossfade when the song is in its last seconds.
    fn maybe_crossfade(&mut self) {
        if !self.crossfade || self.fade.is_some() || !self.state.playing || self.current_is_stream() {
            return;
        }
        let Some(i) = self.state.index else { return };
        let dur = self.state.duration_ms;
        let fade_ms = FADE.as_millis() as u64;
        // Short songs are not faded, nor is repeat-one (it would fade into itself).
        if dur < fade_ms * 3 || self.repeat == Repeat::One || self.state.position_ms + fade_ms < dur {
            return;
        }
        let Some(j) = next_index(i, self.queue.len(), self.repeat, false) else { return };
        if self.queue.get(j).map(|q| q.stream).unwrap_or(true) {
            return;
        }
        let Some(old_sink) = self.sink.take() else { return };
        let old_level = self.level.clone();
        let old_db = old_level.db();
        self.start(j, true);
        if self.state.index != Some(j) || self.sink.is_none() {
            // The next song could not be opened: let the old one finish normally.
            old_sink.stop();
            return;
        }
        self.level.set_db(SILENT_DB);
        self.fade = Some(Fade { old_sink, old_level, old_db, started: Instant::now() });
    }

    /// Moves both levels along the fade; ends it when done.
    fn step_fade(&mut self) {
        let Some(f) = &self.fade else { return };
        let t = (f.started.elapsed().as_secs_f32() / FADE.as_secs_f32()).min(1.0);
        let (out_db, in_db) = fade_db(t);
        f.old_level.set_db(f.old_db + out_db);
        let target = self.state.index.map(|i| self.sound_check_db(i)).unwrap_or(0.0);
        self.level.set_db(target + in_db);
        if t >= 1.0 {
            self.end_fade();
        }
    }

    /// Stops the fading-out song at once (also when the user does something).
    fn end_fade(&mut self) {
        if let Some(f) = self.fade.take() {
            f.old_sink.stop();
            let target = self.state.index.map(|i| self.sound_check_db(i)).unwrap_or(0.0);
            self.level.set_db(target);
        }
    }

    /// Sound Check gain for queue[i]: the tag, else the measurement (started if needed).
    fn sound_check_db(&mut self, i: usize) -> f32 {
        if !self.sound_check {
            return 0.0;
        }
        let Some(item) = self.queue.get(i) else { return 0.0 };
        if item.stream {
            return 0.0;
        }
        if let Some(g) = item.gain_db {
            return g.clamp(-12.0, 9.0);
        }
        if let Some(g) = self.measured.get(&item.path) {
            return g.unwrap_or(0.0);
        }
        let path = item.path.clone();
        if self.measuring.insert(path.clone()) {
            let tx = self.own_tx.clone();
            thread::Builder::new()
                .name("wheeldesk-loudness".into())
                .spawn(move || {
                    let g = open_decoder(&path).ok().and_then(|d| {
                        panic::catch_unwind(AssertUnwindSafe(|| dsp::analyze_loudness(d, 600))).ok().flatten()
                    });
                    let _ = tx.send(Command::Measured(path, g));
                })
                .ok();
        }
        0.0
    }

    fn apply_sound_check(&mut self) {
        let db = self.state.index.map(|i| self.sound_check_db(i)).unwrap_or(0.0);
        self.level.set_db(db);
    }

    fn run(mut self, rx: mpsc::Receiver<Command>) {
        self.emit();
        loop {
            let tick = if self.fade.is_some() { Duration::from_millis(50) } else { TICK };
            match rx.recv_timeout(tick) {
                Ok(cmd) => {
                    self.handle_cmd(cmd);
                    // Apply any further queued commands before reporting once.
                    while let Ok(cmd) = rx.try_recv() {
                        self.handle_cmd(cmd);
                    }
                    self.refresh_position();
                    self.emit();
                }
                Err(RecvTimeoutError::Timeout) => {
                    if self.fade.is_some() {
                        self.step_fade();
                        self.refresh_position();
                        self.emit_throttled();
                        continue;
                    }
                    let title_changed = self.refresh_title();
                    if self.state.playing && !self.state.buffering {
                        if self.sink.as_ref().map(|s| s.empty()).unwrap_or(false) {
                            if self.current_is_stream() {
                                self.reconnect();
                            } else {
                                self.advance(false);
                            }
                        }
                        self.refresh_position();
                        self.maybe_crossfade();
                        self.emit();
                    } else if title_changed {
                        self.emit();
                    }
                }
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
    }

    fn emit(&self) {
        (self.on_state)(&self.state);
        self.last_emit.set(Instant::now());
    }

    /// While fading the loop runs every 50 ms; the UI still only needs ~4 updates a second.
    fn emit_throttled(&self) {
        if self.last_emit.get().elapsed() >= TICK {
            self.emit();
        }
    }

    fn current_is_stream(&self) -> bool {
        self.state.index.and_then(|i| self.queue.get(i)).map(|q| q.stream).unwrap_or(false)
    }

    /// Copies the station's latest title into the state; true if it changed.
    fn refresh_title(&mut self) -> bool {
        let t = self.stream_title.as_ref().and_then(|t| t.lock().ok().and_then(|g| g.clone()));
        if t != self.state.stream_title {
            self.state.stream_title = t;
            true
        } else {
            false
        }
    }

    fn reconnect(&mut self) {
        let Some(i) = self.state.index else { return };
        if self.retries >= STREAM_RETRIES {
            self.stop();
            self.state.error = Some("Station stopped sending audio".into());
            return;
        }
        self.retries += 1;
        self.start(i, true);
    }

    fn refresh_position(&mut self) {
        if let Some(sink) = &self.sink {
            let pos = sink.get_pos().as_millis() as u64;
            // Live streams have no duration: the position is time listened.
            self.state.position_ms = if self.state.duration_ms > 0 { pos.min(self.state.duration_ms) } else { pos };
        }
    }

    fn handle_cmd(&mut self, cmd: Command) {
        let keeps_fade = matches!(
            cmd,
            Command::Volume(_) | Command::SetEq(_) | Command::SoundCheck(_) | Command::Crossfade(true) | Command::Measured(..) | Command::SetRepeat(_)
        );
        if !keeps_fade {
            self.end_fade();
        }
        match cmd {
            Command::Load { queue, index, play } => {
                self.queue = queue;
                self.state.queue_len = self.queue.len();
                if self.queue.is_empty() {
                    self.stop();
                } else {
                    self.start(index.min(self.queue.len() - 1), play);
                }
            }
            // A live stream is stopped rather than paused, so it resumes live, not delayed.
            Command::PlayPause if self.current_is_stream() => {
                if self.state.playing {
                    let i = self.state.index;
                    self.stop();
                    self.state.index = i;
                } else if let Some(i) = self.state.index {
                    self.retries = 0;
                    self.start(i, true);
                }
            }
            Command::PlayPause => match &self.sink {
                Some(sink) if self.state.playing => {
                    sink.pause();
                    self.state.playing = false;
                }
                Some(sink) => {
                    sink.play();
                    self.state.playing = true;
                }
                None => {
                    if let Some(i) = self.state.index {
                        self.start(i, true);
                    }
                }
            },
            Command::Pause if self.current_is_stream() => {
                let i = self.state.index;
                self.stop();
                self.state.index = i;
            }
            Command::Pause => {
                if let Some(sink) = &self.sink {
                    sink.pause();
                }
                self.state.playing = false;
            }
            Command::Next if self.current_is_stream() => {
                let Some(i) = self.state.index else { return };
                self.retries = 0;
                self.start((i + 1) % self.queue.len().max(1), true);
            }
            Command::Next => self.advance(true),
            Command::Prev => {
                let Some(i) = self.state.index else { return };
                if self.current_is_stream() {
                    // Stations: previous always means the previous station.
                    let j = if i > 0 { i - 1 } else { self.queue.len().saturating_sub(1) };
                    self.retries = 0;
                    self.start(j, true);
                    return;
                }
                match prev_action(i, self.queue.len(), self.state.position_ms, self.repeat) {
                    PrevAction::Restart => self.seek(0),
                    PrevAction::Go(j) => self.start(j, self.state.playing),
                }
            }
            Command::SeekTo(_) | Command::SeekBy(_) if self.current_is_stream() => {}
            Command::SeekTo(ms) => self.seek(ms),
            Command::SeekBy(delta) => {
                let target = (self.state.position_ms as i64 + delta).max(0) as u64;
                if self.state.duration_ms > 0 && target >= self.state.duration_ms {
                    self.advance(true);
                } else {
                    self.seek(target);
                }
            }
            Command::Volume(v) => {
                self.state.volume = v.clamp(0.0, 1.0);
                if let Some(sink) = &self.sink {
                    sink.set_volume(curve(self.state.volume));
                }
                if let Some(f) = &self.fade {
                    f.old_sink.set_volume(curve(self.state.volume));
                }
            }
            Command::SetRepeat(r) => self.repeat = r,
            Command::SetEq(g) => self.eq.set(g),
            Command::Crossfade(on) => self.crossfade = on,
            Command::SoundCheck(on) => {
                self.sound_check = on;
                self.apply_sound_check();
            }
            Command::Measured(path, g) => {
                self.measuring.remove(&path);
                self.measured.insert(path.clone(), g);
                if self.state.path.as_deref() == Some(path.as_str()) {
                    self.apply_sound_check();
                }
            }
            Command::Stop => self.stop(),
            Command::StreamOpened(gen, result) => {
                if gen != self.generation {
                    // The user already moved on: shut this connection down.
                    if let Ok(live) = result {
                        live.stop.store(true, Ordering::Relaxed);
                    }
                    return;
                }
                self.state.buffering = false;
                match result {
                    Ok(stream) => self.play_stream(stream),
                    Err(e) => {
                        self.state.error = Some(format!("Cannot connect: {e}"));
                        self.state.playing = false;
                    }
                }
            }
        }
    }

    fn play_stream(&mut self, live: crate::stream::Live) {
        let Some(out) = &self.stream else {
            live.stop.store(true, Ordering::Relaxed);
            self.state.playing = false;
            return;
        };
        self.stream_title = Some(live.title.clone());
        self.stream_stop = Some(live.stop.clone());
        let sink = Sink::connect_new(out.mixer());
        sink.set_volume(curve(self.state.volume));
        self.level = Level::new(0.0);
        sink.append(Dsp::new(live.source, self.eq.clone(), self.level.clone()));
        self.sink = Some(sink);
        self.state.playing = true;
        self.state.error = None;
    }

    fn seek(&mut self, ms: u64) {
        if let Some(sink) = &self.sink {
            if sink.try_seek(Duration::from_millis(ms)).is_ok() {
                self.state.position_ms = ms;
            }
        }
    }

    fn stop(&mut self) {
        self.generation += 1;
        if let Some(sink) = self.sink.take() {
            sink.stop();
        }
        if let Some(stop) = self.stream_stop.take() {
            stop.store(true, Ordering::Relaxed);
        }
        self.stream_title = None;
        self.state.stream_title = None;
        self.state.buffering = false;
        self.state.playing = false;
        self.state.position_ms = 0;
    }

    fn advance(&mut self, user: bool) {
        let Some(i) = self.state.index else { return };
        match next_index(i, self.queue.len(), self.repeat, user) {
            Some(j) => self.start(j, self.state.playing || !user),
            None => {
                // End of the list: stop and fall back to the start, like the original.
                self.stop();
                self.state.index = Some(0);
                self.state.path = self.queue.first().map(|q| q.path.clone());
                self.state.duration_ms = self.queue.first().map(|q| q.duration_ms).unwrap_or(0);
            }
        }
    }

    /// Starts queue[index]; unreadable files are skipped forward. Streams
    /// connect in the background and start when buffered.
    fn start(&mut self, index: usize, play: bool) {
        let keep_retries = self.retries;
        self.stop();
        let len = self.queue.len();
        if let Some(item) = self.queue.get(index).filter(|q| q.stream).cloned() {
            self.retries = keep_retries;
            self.state.index = Some(index);
            self.state.path = Some(item.path.clone());
            self.state.duration_ms = 0;
            self.state.error = None;
            if !play {
                return;
            }
            if self.stream.is_none() {
                return;
            }
            self.state.buffering = true;
            self.state.playing = true;
            let gen = self.generation;
            let tx = self.own_tx.clone();
            thread::spawn(move || {
                let r = crate::stream::open_live(&item.path);
                if let Err(mpsc::SendError(Command::StreamOpened(_, Ok(live)))) = tx.send(Command::StreamOpened(gen, r)) {
                    // Player is gone: stop the download.
                    live.stop.store(true, Ordering::Relaxed);
                }
            });
            return;
        }
        self.retries = 0;
        for attempt in 0..len {
            let i = (index + attempt) % len;
            let item = self.queue[i].clone();
            self.state.index = Some(i);
            self.state.path = Some(item.path.clone());
            self.state.position_ms = 0;
            self.state.duration_ms = item.duration_ms;

            if self.stream.is_none() {
                self.state.playing = false;
                return;
            }
            match open_decoder(&item.path) {
                Ok(dec) => {
                    if self.state.duration_ms == 0 {
                        self.state.duration_ms = dec.total_duration().map(|d| d.as_millis() as u64).unwrap_or(0);
                        self.queue[i].duration_ms = self.state.duration_ms;
                    }
                    // Each song gets its own level, so a fade-out never touches the next one.
                    let db = self.sound_check_db(i);
                    self.level = Level::new(db);
                    let Some(stream) = &self.stream else { return };
                    let sink = Sink::connect_new(stream.mixer());
                    sink.set_volume(curve(self.state.volume));
                    sink.append(Dsp::new(dec, self.eq.clone(), self.level.clone()));
                    if !play {
                        sink.pause();
                    }
                    self.sink = Some(sink);
                    self.state.playing = play;
                    self.state.error = None;
                    return;
                }
                Err(e) => {
                    self.state.error = Some(format!("Cannot play {}: {e}", item.path));
                }
            }
        }
        self.state.playing = false;
    }
}

/// Levels (dB) of the outgoing and incoming song at fade progress `t` (0–1).
/// Equal-power curves keep the loudness steady through the middle.
pub fn fade_db(t: f32) -> (f32, f32) {
    let t = t.clamp(0.0, 1.0);
    let to_db = |g: f32| if g <= 0.001 { SILENT_DB } else { (20.0 * g.log10()).max(SILENT_DB) };
    (to_db((t * std::f32::consts::FRAC_PI_2).cos()), to_db((t * std::f32::consts::FRAC_PI_2).sin()))
}

/// Perceptual volume: the bar moves evenly to the ear.
fn curve(v: f32) -> f32 {
    v * v
}

/// Opens a decoder with the file size and extension as hints (needed for
/// reliable MP4/AAC and accurate durations). A decoder bug must never take
/// the player thread down, so panics are turned into errors.
pub fn open_decoder(path: &str) -> Result<Decoder<BufReader<File>>, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let len = file.metadata().map_err(|e| e.to_string())?.len();
    let hint = Path::new(path).extension().map(|e| e.to_string_lossy().to_lowercase());
    panic::catch_unwind(AssertUnwindSafe(move || {
        let mut b = DecoderBuilder::new()
            .with_data(BufReader::new(file))
            .with_byte_len(len)
            .with_seekable(true)
            .with_gapless(true);
        if let Some(h) = &hint {
            b = b.with_hint(h);
        }
        b.build().map_err(|e| e.to_string())
    }))
    .unwrap_or_else(|_| Err("decoder failed".into()))
}

/// Checks that a file can be decoded, without needing an audio device.
pub fn can_decode(path: &str) -> Result<Option<Duration>, String> {
    Ok(open_decoder(path)?.total_duration())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crossfade_swaps_the_songs_at_equal_power() {
        assert_eq!(fade_db(0.0), (0.0, SILENT_DB));
        assert_eq!(fade_db(1.0).1, 0.0);
        assert!(fade_db(1.0).0 <= -59.0);
        let (o, i) = fade_db(0.5);
        assert!((o + 3.01).abs() < 0.05 && (i + 3.01).abs() < 0.05);
    }

    #[test]
    fn next_follows_repeat_rules() {
        assert_eq!(next_index(0, 3, Repeat::Off, false), Some(1));
        assert_eq!(next_index(2, 3, Repeat::Off, false), None);
        assert_eq!(next_index(2, 3, Repeat::All, false), Some(0));
        assert_eq!(next_index(1, 3, Repeat::One, false), Some(1));
        assert_eq!(next_index(1, 3, Repeat::One, true), Some(2));
        assert_eq!(next_index(0, 0, Repeat::All, true), None);
    }

    #[test]
    fn previous_restarts_after_three_seconds() {
        assert!(matches!(prev_action(2, 5, 3500, Repeat::Off), PrevAction::Restart));
        assert!(matches!(prev_action(2, 5, 1000, Repeat::Off), PrevAction::Go(1)));
        assert!(matches!(prev_action(0, 5, 1000, Repeat::Off), PrevAction::Restart));
        assert!(matches!(prev_action(0, 5, 1000, Repeat::All), PrevAction::Go(4)));
    }
}
