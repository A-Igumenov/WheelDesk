//! Internet radio input. A download thread fetches the stream (Icecast /
//! Shoutcast with ICY titles, .pls/.m3u playlists, or HLS), strips everything
//! that is not audio and feeds a buffered pipe. The decoder reads from the
//! pipe, so a slow network never blocks the audio callback for long and the UI
//! is never involved at all.

use std::collections::VecDeque;
use std::io::{self, Read, Seek, SeekFrom};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

const PIPE_CAP: usize = 1024 * 1024;
const PREFILL: usize = 48 * 1024;
const PREFILL_TIMEOUT: Duration = Duration::from_secs(12);
const USER_AGENT: &str = concat!("WheelDesk/", env!("CARGO_PKG_VERSION"));

// ------------------------------------------------------------------ pipe

#[derive(Default)]
struct PipeState {
    data: VecDeque<u8>,
    closed: bool,
    reader_gone: bool,
    error: Option<String>,
}

#[derive(Default)]
struct Pipe {
    state: Mutex<PipeState>,
    cv: Condvar,
}

/// Download side of the pipe.
#[derive(Clone)]
pub struct PipeWriter(Arc<Pipe>);

impl PipeWriter {
    /// Appends audio bytes; false once the player has moved on.
    pub fn write(&self, bytes: &[u8]) -> bool {
        let mut s = self.0.state.lock().unwrap();
        while s.data.len() > PIPE_CAP && !s.reader_gone {
            s = self.0.cv.wait_timeout(s, Duration::from_millis(200)).unwrap().0;
        }
        if s.reader_gone {
            return false;
        }
        s.data.extend(bytes);
        self.0.cv.notify_all();
        true
    }

    pub fn close(&self, error: Option<String>) {
        let mut s = self.0.state.lock().unwrap();
        s.closed = true;
        if s.error.is_none() {
            s.error = error;
        }
        self.0.cv.notify_all();
    }

    pub fn reader_gone(&self) -> bool {
        self.0.state.lock().unwrap().reader_gone
    }
}

/// Decoder side of the pipe. Seeking is not possible on live radio; only the
/// "where am I" query is answered, which is what the decoder asks for.
pub struct PipeReader {
    pipe: Arc<Pipe>,
    pos: u64,
}

impl Read for PipeReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let mut s = self.pipe.state.lock().unwrap();
        while s.data.is_empty() && !s.closed {
            s = self.pipe.cv.wait(s).unwrap();
        }
        let n = buf.len().min(s.data.len());
        for (i, b) in s.data.drain(..n).enumerate() {
            buf[i] = b;
        }
        self.pipe.cv.notify_all();
        self.pos += n as u64;
        Ok(n)
    }
}

impl Seek for PipeReader {
    fn seek(&mut self, pos: SeekFrom) -> io::Result<u64> {
        match pos {
            SeekFrom::Current(0) => Ok(self.pos),
            _ => Err(io::Error::new(io::ErrorKind::Unsupported, "live stream")),
        }
    }
}

impl Drop for PipeReader {
    fn drop(&mut self) {
        let mut s = self.pipe.state.lock().unwrap();
        s.reader_gone = true;
        self.pipe.cv.notify_all();
    }
}

pub fn pipe() -> (PipeWriter, PipeReader) {
    let p = Arc::new(Pipe::default());
    (PipeWriter(p.clone()), PipeReader { pipe: p, pos: 0 })
}

// ------------------------------------------------------------------ ICY metadata

/// Removes ICY metadata blocks from a Shoutcast/Icecast byte stream and
/// returns the titles found. Works across arbitrary chunk boundaries.
pub struct IcyDemux {
    metaint: usize,
    audio_left: usize,
    meta_left: Option<usize>,
    meta: Vec<u8>,
}

impl IcyDemux {
    pub fn new(metaint: usize) -> Self {
        Self { metaint, audio_left: metaint, meta_left: None, meta: Vec::new() }
    }

    pub fn feed(&mut self, mut input: &[u8], audio: &mut Vec<u8>, titles: &mut Vec<String>) {
        while !input.is_empty() {
            match self.meta_left {
                None if self.audio_left > 0 => {
                    let n = self.audio_left.min(input.len());
                    audio.extend_from_slice(&input[..n]);
                    input = &input[n..];
                    self.audio_left -= n;
                }
                None => {
                    // Length byte: block size in units of 16 bytes.
                    let len = input[0] as usize * 16;
                    input = &input[1..];
                    if len == 0 {
                        self.audio_left = self.metaint;
                    } else {
                        self.meta_left = Some(len);
                        self.meta.clear();
                    }
                }
                Some(left) => {
                    let n = left.min(input.len());
                    self.meta.extend_from_slice(&input[..n]);
                    input = &input[n..];
                    if n == left {
                        if let Some(t) = parse_icy_title(&self.meta) {
                            titles.push(t);
                        }
                        self.meta_left = None;
                        self.audio_left = self.metaint;
                    } else {
                        self.meta_left = Some(left - n);
                    }
                }
            }
        }
    }
}

/// `StreamTitle='Artist - Title';` → "Artist - Title". Stations send UTF-8,
/// Windows-1257 (Lithuanian) or Windows-1251 (Russian); all are handled.
pub fn parse_icy_title(meta: &[u8]) -> Option<String> {
    let end = meta.iter().rposition(|&b| b != 0).map(|i| i + 1).unwrap_or(0);
    let raw = &meta[..end];
    let text = crate::text::decode_legacy_bytes(raw);
    let start = text.find("StreamTitle='")? + "StreamTitle='".len();
    let rest = &text[start..];
    let stop = rest.find("';").unwrap_or(rest.len());
    let title = rest[..stop].trim().to_string();
    (!title.is_empty()).then_some(title)
}

// ------------------------------------------------------------------ playlists

/// First stream URL in a .pls or .m3u file.
pub fn first_url_in_playlist(text: &str) -> Option<String> {
    if text.contains("<playlist") {
        return crate::playlists::parse_xspf(text).into_iter()
            .map(|entry| entry.location)
            .find(|url| url.starts_with("http://") || url.starts_with("https://"));
    }
    text.lines().find_map(|l| {
        let l = l.trim();
        let v = l.split_once('=').filter(|(k, _)| k.to_ascii_lowercase().starts_with("file")).map(|(_, v)| v).unwrap_or(l);
        (v.starts_with("http://") || v.starts_with("https://")).then(|| v.trim().to_string())
    })
}

fn resolve_url(base: &str, rel: &str) -> String {
    if rel.starts_with("http://") || rel.starts_with("https://") {
        return rel.to_string();
    }
    if let Some(stripped) = rel.strip_prefix('/') {
        // Scheme + host of base.
        let host_end = base.find("://").map(|i| i + 3).and_then(|i| base[i..].find('/').map(|j| i + j)).unwrap_or(base.len());
        return format!("{}/{}", &base[..host_end], stripped);
    }
    let dir_end = base.split('?').next().unwrap_or(base).rfind('/').map(|i| i + 1).unwrap_or(base.len());
    format!("{}{}", &base[..dir_end], rel)
}

#[derive(Debug, PartialEq)]
pub struct HlsMedia {
    pub target_duration: f64,
    pub media_sequence: u64,
    pub segments: Vec<(u64, String)>,
    pub ended: bool,
}

#[derive(Debug, PartialEq)]
pub enum Hls {
    /// Variant playlists (url, bandwidth).
    Master(Vec<(String, u64)>),
    Media(HlsMedia),
}

pub fn parse_hls(base: &str, text: &str) -> Hls {
    let mut variants = Vec::new();
    let mut pending_bw: Option<u64> = None;
    let mut target = 6.0;
    let mut seq = 0u64;
    let mut segs = Vec::new();
    let mut ended = false;
    for line in text.lines().map(str::trim).filter(|l| !l.is_empty()) {
        if let Some(attrs) = line.strip_prefix("#EXT-X-STREAM-INF:") {
            let bw = attrs
                .split(',')
                .find_map(|a| a.trim().strip_prefix("BANDWIDTH="))
                .and_then(|v| v.parse().ok())
                .unwrap_or(0);
            pending_bw = Some(bw);
        } else if let Some(v) = line.strip_prefix("#EXT-X-TARGETDURATION:") {
            target = v.parse().unwrap_or(6.0);
        } else if let Some(v) = line.strip_prefix("#EXT-X-MEDIA-SEQUENCE:") {
            seq = v.parse().unwrap_or(0);
        } else if line.starts_with("#EXT-X-ENDLIST") {
            ended = true;
        } else if !line.starts_with('#') {
            let url = resolve_url(base, line);
            if let Some(bw) = pending_bw.take() {
                variants.push((url, bw));
            } else {
                segs.push((seq + segs.len() as u64, url));
            }
        }
    }
    if !variants.is_empty() {
        Hls::Master(variants)
    } else {
        Hls::Media(HlsMedia { target_duration: target, media_sequence: seq, segments: segs, ended })
    }
}

/// Skips an ID3v2 tag at the start of an HLS audio segment.
fn strip_id3(b: &[u8]) -> &[u8] {
    if b.len() >= 10 && &b[..3] == b"ID3" {
        let size = ((b[6] as usize & 0x7f) << 21) | ((b[7] as usize & 0x7f) << 14) | ((b[8] as usize & 0x7f) << 7) | (b[9] as usize & 0x7f);
        let footer = if b[5] & 0x10 != 0 { 10 } else { 0 };
        let total = 10 + size + footer;
        if total <= b.len() {
            return strip_id3(&b[total..]);
        }
    }
    b
}

/// Minimal MPEG-TS demuxer: returns the audio elementary stream (ADTS AAC or
/// MPEG audio) and its decoder hint.
pub fn demux_ts(data: &[u8]) -> Option<(Vec<u8>, &'static str)> {
    let mut pmt_pid: Option<u16> = None;
    let mut audio: Option<(u16, &'static str)> = None;
    let mut out = Vec::new();
    for pkt in data.chunks_exact(188) {
        if pkt[0] != 0x47 {
            continue;
        }
        let pusi = pkt[1] & 0x40 != 0;
        let pid = (((pkt[1] & 0x1f) as u16) << 8) | pkt[2] as u16;
        let afc = (pkt[3] >> 4) & 0x3;
        let mut off = 4;
        if afc == 2 || afc == 3 {
            off += 1 + pkt[4] as usize;
        }
        if afc == 2 || off >= 188 {
            continue;
        }
        let payload = &pkt[off..];
        if pid == 0 && pusi {
            // PAT: first program's PMT PID.
            let p = &payload[1 + payload[0] as usize..];
            if p.len() >= 12 {
                pmt_pid = Some((((p[10] & 0x1f) as u16) << 8) | p[11] as u16);
            }
        } else if Some(pid) == pmt_pid && pusi && audio.is_none() {
            let p = &payload[1 + payload[0] as usize..];
            if p.len() < 12 {
                continue;
            }
            let section_len = (((p[1] & 0x0f) as usize) << 8) | p[2] as usize;
            let info_len = (((p[10] & 0x0f) as usize) << 8) | p[11] as usize;
            let mut i = 12 + info_len;
            let end = (3 + section_len).saturating_sub(4).min(p.len());
            while i + 5 <= end {
                let stype = p[i];
                let epid = (((p[i + 1] & 0x1f) as u16) << 8) | p[i + 2] as u16;
                let es_len = (((p[i + 3] & 0x0f) as usize) << 8) | p[i + 4] as usize;
                let hint = match stype {
                    0x0f => Some("aac"),
                    0x03 | 0x04 => Some("mp3"),
                    _ => None,
                };
                if let Some(h) = hint {
                    audio = Some((epid, h));
                    break;
                }
                i += 5 + es_len;
            }
        } else if let Some((apid, _)) = audio {
            if pid != apid {
                continue;
            }
            if pusi && payload.len() >= 9 && payload[..3] == [0, 0, 1] {
                let hdr = 9 + payload[8] as usize;
                if hdr <= payload.len() {
                    out.extend_from_slice(&payload[hdr..]);
                }
            } else {
                out.extend_from_slice(payload);
            }
        }
    }
    audio.map(|(_, h)| (out, h))
}

// ------------------------------------------------------------------ opening a stream

/// A running stream: the reader for the decoder, a format hint, the latest
/// title from the station and a stop switch for the download thread.
pub struct Stream {
    pub reader: PipeReader,
    pub hint: Option<&'static str>,
    pub title: Arc<Mutex<Option<String>>>,
    pub stop: Arc<AtomicBool>,
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(10))
        .timeout_read(Duration::from_secs(20))
        .user_agent(USER_AGENT)
        .build()
}

fn hint_for(content_type: &str, url: &str) -> Option<&'static str> {
    let ct = content_type.to_ascii_lowercase();
    let u = url.to_ascii_lowercase();
    if ct.contains("mpeg") && !ct.contains("mpegurl") || u.ends_with(".mp3") {
        Some("mp3")
    } else if ct.contains("aac") || u.ends_with(".aac") {
        Some("aac")
    } else if ct.contains("ogg") || u.ends_with(".ogg") {
        Some("ogg")
    } else {
        None
    }
}

fn is_hls(content_type: &str, url: &str) -> bool {
    let ct = content_type.to_ascii_lowercase();
    ct.contains("mpegurl") && (url.contains(".m3u8") || ct.contains("apple")) || url.split('?').next().unwrap_or(url).ends_with(".m3u8")
}

fn is_playlist(content_type: &str, url: &str) -> bool {
    let ct = content_type.to_ascii_lowercase();
    let path = url.split('?').next().unwrap_or(url).to_ascii_lowercase();
    ct.contains("scpls") || ct.contains("x-mpegurl") || ct.contains("xspf")
        || path.ends_with(".pls") || path.ends_with(".m3u") || path.ends_with(".xspf")
}

/// Connects and starts the download thread. Returns once enough audio is
/// buffered to start smoothly (or the stream ended / failed).
pub fn open(url: &str) -> Result<Stream, String> {
    open_depth(url, 0)
}

fn open_depth(url: &str, depth: u32) -> Result<Stream, String> {
    if depth > 3 {
        return Err("too many playlist redirects".into());
    }
    let agent = agent();
    let resp = agent.get(url).set("Icy-MetaData", "1").call().map_err(|e| e.to_string())?;
    let ct = resp.content_type().to_string();
    let final_url = resp.get_url().to_string();

    if is_hls(&ct, &final_url) {
        let text = resp.into_string().map_err(|e| e.to_string())?;
        return open_hls(agent, final_url, text);
    }
    if is_playlist(&ct, &final_url) {
        let text = resp.into_string().map_err(|e| e.to_string())?;
        if text.contains("#EXT-X-") {
            return open_hls(agent, final_url, text);
        }
        let next = first_url_in_playlist(&text).ok_or("empty playlist")?;
        return open_depth(&next, depth + 1);
    }

    let metaint: Option<usize> = resp.header("icy-metaint").and_then(|v| v.trim().parse().ok()).filter(|&n| n > 0);
    let hint = hint_for(&ct, &final_url);
    let mut body = resp.into_reader();

    let (writer, reader) = pipe();
    let title = Arc::new(Mutex::new(None));
    let stop = Arc::new(AtomicBool::new(false));
    {
        let (title, stop, writer) = (title.clone(), stop.clone(), writer.clone());
        thread::Builder::new()
            .name("wheeldesk-stream".into())
            .spawn(move || {
                let mut icy = metaint.map(IcyDemux::new);
                let mut buf = vec![0u8; 16 * 1024];
                let mut audio = Vec::with_capacity(buf.len());
                let mut titles = Vec::new();
                loop {
                    if stop.load(Ordering::Relaxed) || writer.reader_gone() {
                        break;
                    }
                    let n = match body.read(&mut buf) {
                        Ok(0) => {
                            writer.close(Some("stream ended".into()));
                            break;
                        }
                        Ok(n) => n,
                        Err(e) => {
                            writer.close(Some(e.to_string()));
                            break;
                        }
                    };
                    audio.clear();
                    match icy.as_mut() {
                        Some(d) => d.feed(&buf[..n], &mut audio, &mut titles),
                        None => audio.extend_from_slice(&buf[..n]),
                    }
                    if let Some(t) = titles.drain(..).last() {
                        *title.lock().unwrap() = Some(t);
                    }
                    if !writer.write(&audio) {
                        break;
                    }
                }
                writer.close(None);
            })
            .map_err(|e| e.to_string())?;
    }
    wait_prefill(&reader)?;
    Ok(Stream { reader, hint, title, stop })
}

fn open_hls(agent: ureq::Agent, url: String, first_text: String) -> Result<Stream, String> {
    // Master playlist: take the best variant up to 320 kbit/s (or the first one).
    let (mut playlist_url, mut text) = (url, first_text);
    for _ in 0..3 {
        match parse_hls(&playlist_url, &text) {
            Hls::Master(mut vars) => {
                vars.sort_by_key(|(_, bw)| *bw);
                let pick = vars.iter().rev().find(|(_, bw)| *bw <= 320_000).or(vars.first()).cloned().ok_or("no variants")?;
                playlist_url = pick.0;
                text = agent.get(&playlist_url).call().map_err(|e| e.to_string())?.into_string().map_err(|e| e.to_string())?;
            }
            Hls::Media(_) => break,
        }
    }
    let Hls::Media(first) = parse_hls(&playlist_url, &text) else {
        return Err("HLS master without media playlist".into());
    };
    let probe_url = first.segments.last().map(|s| s.1.clone()).ok_or("empty HLS playlist")?;
    let hint_hls: Option<&'static str> = if probe_url.contains(".ts") { None } else { hint_for("", &probe_url).or(Some("aac")) };

    let (writer, reader) = pipe();
    let title = Arc::new(Mutex::new(None));
    let stop = Arc::new(AtomicBool::new(false));
    let detected: Arc<Mutex<Option<&'static str>>> = Arc::new(Mutex::new(hint_hls));
    {
        let (stop, writer, detected) = (stop.clone(), writer.clone(), detected.clone());
        thread::Builder::new()
            .name("wheeldesk-hls".into())
            .spawn(move || {
                let mut last: Option<u64> = None;
                let mut media = first;
                loop {
                    if stop.load(Ordering::Relaxed) || writer.reader_gone() {
                        break;
                    }
                    // Live start: a few segments back from the live edge.
                    let start_from = last.map(|l| l + 1).unwrap_or_else(|| {
                        media.segments.iter().rev().nth(2).or(media.segments.first()).map(|s| s.0).unwrap_or(0)
                    });
                    for (seq, seg_url) in media.segments.iter().filter(|(s, _)| *s >= start_from) {
                        let mut bytes = Vec::new();
                        let ok = agent
                            .get(seg_url)
                            .call()
                            .ok()
                            .and_then(|r| r.into_reader().take(16 * 1024 * 1024).read_to_end(&mut bytes).ok())
                            .is_some();
                        last = Some(*seq);
                        if !ok {
                            continue;
                        }
                        let audio: Vec<u8> = if bytes.first() == Some(&0x47) {
                            match demux_ts(&bytes) {
                                Some((a, h)) => {
                                    detected.lock().unwrap().get_or_insert(h);
                                    a
                                }
                                None => continue,
                            }
                        } else {
                            strip_id3(&bytes).to_vec()
                        };
                        if !writer.write(&audio) {
                            return;
                        }
                    }
                    if media.ended {
                        break;
                    }
                    let wait = Duration::from_secs_f64((media.target_duration / 2.0).clamp(1.0, 10.0));
                    let until = Instant::now() + wait;
                    while Instant::now() < until {
                        if stop.load(Ordering::Relaxed) || writer.reader_gone() {
                            writer.close(None);
                            return;
                        }
                        thread::sleep(Duration::from_millis(200));
                    }
                    match agent.get(&playlist_url).call().ok().and_then(|r| r.into_string().ok()) {
                        Some(t) => {
                            if let Hls::Media(m) = parse_hls(&playlist_url, &t) {
                                media = m;
                            }
                        }
                        None => continue,
                    }
                }
                writer.close(Some("stream ended".into()));
            })
            .map_err(|e| e.to_string())?;
    }
    wait_prefill(&reader)?;
    let hint = *detected.lock().unwrap();
    Ok(Stream { reader, hint, title, stop })
}

fn wait_prefill(reader: &PipeReader) -> Result<(), String> {
    let deadline = Instant::now() + PREFILL_TIMEOUT;
    let mut s = reader.pipe.state.lock().unwrap();
    while s.data.len() < PREFILL && !s.closed {
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            break;
        }
        s = reader.pipe.cv.wait_timeout(s, left).unwrap().0;
    }
    if s.data.is_empty() {
        return Err(s.error.clone().unwrap_or_else(|| "no data from station".into()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn icy_block(text: &str) -> Vec<u8> {
        let mut m = format!("StreamTitle='{text}';").into_bytes();
        while m.len() % 16 != 0 {
            m.push(0);
        }
        let mut out = vec![(m.len() / 16) as u8];
        out.extend(m);
        out
    }

    #[test]
    fn icy_titles_are_removed_from_audio_across_chunks() {
        let mut stream = Vec::new();
        stream.extend([1u8; 8]);
        stream.extend(icy_block("Artist - Song"));
        stream.extend([2u8; 8]);
        stream.push(0); // empty metadata block
        stream.extend([3u8; 8]);
        stream.extend(icy_block("Kitas – Daina"));
        stream.extend([4u8; 3]);

        for chunk in [1, 3, 7, 1000] {
            let mut d = IcyDemux::new(8);
            let (mut audio, mut titles) = (Vec::new(), Vec::new());
            for c in stream.chunks(chunk) {
                d.feed(c, &mut audio, &mut titles);
            }
            let expect: Vec<u8> = [[1u8; 8], [2; 8], [3; 8]].concat().into_iter().chain([4; 3]).collect();
            assert_eq!(audio, expect, "chunk {chunk}");
            assert_eq!(titles, ["Artist - Song", "Kitas – Daina"]);
        }
    }

    #[test]
    fn icy_title_in_windows_1257() {
        // "Žalgiris" with Ž = 0xDE in Windows-1257.
        let meta = b"StreamTitle='\xDEalgiris - Daina';\0\0";
        assert_eq!(parse_icy_title(meta).as_deref(), Some("Žalgiris - Daina"));
        assert_eq!(parse_icy_title(b"StreamTitle='';\0"), None);
    }

    #[test]
    fn reads_pls_and_m3u() {
        assert_eq!(
            first_url_in_playlist("[playlist]\nNumberOfEntries=1\nFile1=http://s.example:8000/live.mp3\nTitle1=X").as_deref(),
            Some("http://s.example:8000/live.mp3")
        );
        assert_eq!(first_url_in_playlist("#EXTM3U\n#EXTINF:-1,X\nhttps://a.example/s.aac\n").as_deref(), Some("https://a.example/s.aac"));
    }

    #[test]
    fn parses_hls_master_and_media() {
        let master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=64000,CODECS=\"mp4a.40.5\"\nlow/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=128000\nhigh/index.m3u8\n";
        assert_eq!(
            parse_hls("https://h.example/radio/master.m3u8?x=1", master),
            Hls::Master(vec![
                ("https://h.example/radio/low/index.m3u8".into(), 64000),
                ("https://h.example/radio/high/index.m3u8".into(), 128000)
            ])
        );
        let media = "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:100\n#EXTINF:6.0,\nseg100.aac\n#EXTINF:6.0,\n/abs/seg101.aac\n";
        match parse_hls("https://h.example/r/index.m3u8", media) {
            Hls::Media(m) => {
                assert_eq!(m.media_sequence, 100);
                assert_eq!(m.segments, vec![
                    (100, "https://h.example/r/seg100.aac".to_string()),
                    (101, "https://h.example/abs/seg101.aac".to_string())
                ]);
                assert!(!m.ended);
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn strips_id3_from_hls_segments() {
        let mut seg = b"ID3\x04\x00\x00\x00\x00\x00\x05abcde".to_vec();
        seg.extend([0xFF, 0xF1, 0x50]);
        assert_eq!(strip_id3(&seg), &[0xFF, 0xF1, 0x50]);
    }

    fn ts_packet(pid: u16, pusi: bool, payload: &[u8]) -> Vec<u8> {
        let mut p = vec![0x47, ((pusi as u8) << 6) | ((pid >> 8) as u8 & 0x1f), pid as u8, 0x10];
        p.extend_from_slice(payload);
        p.resize(188, 0xff);
        p
    }

    #[test]
    fn demuxes_adts_from_transport_stream() {
        // PAT → program 1 on PMT PID 0x1000.
        let pat = [0u8, 0x00, 0xB0, 0x0D, 0x00, 0x01, 0xC1, 0x00, 0x00, 0x00, 0x01, 0xF0, 0x00, 0, 0, 0, 0];
        // PMT → stream type 0x0F (ADTS AAC) on PID 0x0101.
        let pmt = [0u8, 0x02, 0xB0, 0x12, 0x00, 0x01, 0xC1, 0x00, 0x00, 0xE1, 0x01, 0xF0, 0x00, 0x0F, 0xE1, 0x01, 0xF0, 0x00, 0, 0, 0, 0];
        let mut pes = vec![0, 0, 1, 0xC0, 0, 0, 0x80, 0x80, 5, 0, 0, 0, 0, 0];
        pes.extend([0xFF, 0xF1, 0xAA, 0xBB]);
        let mut ts = ts_packet(0, true, &pat);
        ts.extend(ts_packet(0x1000, true, &pmt));
        // Fill the rest of the first audio packet with an adaptation field instead of 0xFF.
        let mut pkt = vec![0x47, 0x41, 0x01, 0x30, (188 - 5 - pes.len()) as u8, 0x00];
        pkt.resize(188 - pes.len(), 0xff);
        pkt.extend(&pes);
        ts.extend(pkt);
        let (audio, hint) = demux_ts(&ts).expect("audio found");
        assert_eq!(hint, "aac");
        assert_eq!(audio, [0xFF, 0xF1, 0xAA, 0xBB]);
    }

    #[test]
    fn pipe_delivers_in_order_and_ends() {
        let (w, mut r) = pipe();
        let t = thread::spawn(move || {
            for i in 0..100u8 {
                w.write(&[i; 100]);
            }
            w.close(None);
        });
        let mut all = Vec::new();
        r.read_to_end(&mut all).unwrap();
        t.join().unwrap();
        assert_eq!(all.len(), 10_000);
        assert_eq!(all[9_999], 99);
        assert_eq!(r.seek(SeekFrom::Current(0)).unwrap(), 10_000);
        assert!(r.seek(SeekFrom::Start(0)).is_err());
    }
}

// ------------------------------------------------------------------ decoded live audio

/// About 4 seconds of stereo 48 kHz audio.
const RING_CAP: usize = 48_000 * 2 * 4;
/// The audio callback takes samples in batches of this size.
const BATCH: usize = 4096;

struct Ring {
    buf: Mutex<VecDeque<f32>>,
    cv: Condvar,
    /// Decoder finished (stream ended or failed).
    done: AtomicBool,
    /// Player let go of the source: the decode thread should stop.
    stop: AtomicBool,
}

/// Audio source for the output that never blocks: samples come from a
/// separate decode thread, and when none are ready (network hiccup) it plays
/// silence instead of stalling the shared audio output.
pub struct LiveSource {
    ring: Arc<Ring>,
    local: VecDeque<f32>,
    channels: u16,
    rate: u32,
}

impl Iterator for LiveSource {
    type Item = f32;

    fn next(&mut self) -> Option<f32> {
        if let Some(s) = self.local.pop_front() {
            return Some(s);
        }
        let done = {
            let mut b = self.ring.buf.lock().unwrap();
            let n = b.len().min(BATCH);
            self.local.extend(b.drain(..n));
            self.ring.cv.notify_all();
            self.ring.done.load(Ordering::Relaxed) && b.is_empty()
        };
        match self.local.pop_front() {
            Some(s) => Some(s),
            None if done => None,
            None => Some(0.0),
        }
    }
}

impl rodio::Source for LiveSource {
    fn current_span_len(&self) -> Option<usize> {
        None
    }
    fn channels(&self) -> u16 {
        self.channels
    }
    fn sample_rate(&self) -> u32 {
        self.rate
    }
    fn total_duration(&self) -> Option<Duration> {
        None
    }
}

impl Drop for LiveSource {
    fn drop(&mut self) {
        self.ring.stop.store(true, Ordering::Relaxed);
        self.ring.cv.notify_all();
    }
}

/// A connected, decoding live stream ready to be appended to a sink.
pub struct Live {
    pub source: LiveSource,
    pub title: Arc<Mutex<Option<String>>>,
    pub stop: Arc<AtomicBool>,
}

/// Connects, starts decoding on its own thread and returns once the format is
/// known. Never call from the audio thread; may take seconds.
pub fn open_live(url: &str) -> Result<Live, String> {
    use rodio::decoder::DecoderBuilder;
    use rodio::Source;

    let stream = open(url)?;
    let stop = stream.stop.clone();
    let title = stream.title.clone();
    let hint = stream.hint;
    let reader = stream.reader;
    let decoder = std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
        let mut b = DecoderBuilder::new().with_data(reader).with_seekable(false).with_gapless(false);
        if let Some(h) = hint {
            b = b.with_hint(h);
        }
        b.build().map_err(|e| e.to_string())
    }))
    .unwrap_or_else(|_| Err("decoder failed".into()));
    let decoder = match decoder {
        Ok(d) => d,
        Err(e) => {
            stop.store(true, Ordering::Relaxed);
            return Err(format!("unsupported stream: {e}"));
        }
    };
    let channels = decoder.channels();
    let rate = decoder.sample_rate();
    let ring = Arc::new(Ring {
        buf: Mutex::new(VecDeque::with_capacity(RING_CAP)),
        cv: Condvar::new(),
        done: AtomicBool::new(false),
        stop: AtomicBool::new(false),
    });
    {
        let ring = ring.clone();
        let stop_net = stop.clone();
        thread::Builder::new()
            .name("wheeldesk-decode".into())
            .spawn(move || {
                let mut batch = Vec::with_capacity(BATCH);
                let mut it = decoder.into_iter();
                'outer: loop {
                    batch.clear();
                    for _ in 0..BATCH {
                        match it.next() {
                            Some(s) => batch.push(s),
                            None => {
                                push(&ring, &batch);
                                break 'outer;
                            }
                        }
                    }
                    if !push(&ring, &batch) {
                        break;
                    }
                }
                ring.done.store(true, Ordering::Relaxed);
                // Whatever ended decoding, the download is no longer needed.
                stop_net.store(true, Ordering::Relaxed);
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(Live { source: LiveSource { ring, local: VecDeque::with_capacity(BATCH), channels, rate }, title, stop })
}

/// Adds decoded samples, waiting while the ring is full. False once the
/// player has dropped the source.
fn push(ring: &Ring, samples: &[f32]) -> bool {
    let mut b = ring.buf.lock().unwrap();
    while b.len() + samples.len() > RING_CAP {
        if ring.stop.load(Ordering::Relaxed) {
            return false;
        }
        b = ring.cv.wait_timeout(b, Duration::from_millis(100)).unwrap().0;
    }
    if ring.stop.load(Ordering::Relaxed) {
        return false;
    }
    b.extend(samples.iter().copied());
    true
}

#[cfg(test)]
mod live_tests {
    use super::*;

    #[test]
    fn live_source_plays_silence_instead_of_blocking_and_ends_when_done() {
        let ring = Arc::new(Ring {
            buf: Mutex::new(VecDeque::new()),
            cv: Condvar::new(),
            done: AtomicBool::new(false),
            stop: AtomicBool::new(false),
        });
        let mut src = LiveSource { ring: ring.clone(), local: VecDeque::new(), channels: 2, rate: 44_100 };
        // Nothing decoded yet: silence, immediately.
        let t = Instant::now();
        assert_eq!(src.next(), Some(0.0));
        assert!(t.elapsed() < Duration::from_millis(50));
        assert!(push(&ring, &[0.5, -0.5]));
        assert_eq!(src.next(), Some(0.5));
        assert_eq!(src.next(), Some(-0.5));
        ring.done.store(true, Ordering::Relaxed);
        assert_eq!(src.next(), None);
        drop(src);
        assert!(!push(&ring, &[0.1]), "decode thread is told to stop");
    }
}
