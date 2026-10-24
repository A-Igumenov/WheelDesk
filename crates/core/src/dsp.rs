//! Sound processing between the decoder and the output: the 10-band
//! equaliser and the per-song level of Sound Check. Both wrap any rodio
//! source, so files and internet radio go through the same chain.
//!
//! The equaliser is a row of peaking filters (RBJ "Audio EQ Cookbook"
//! biquads). Band gains change while music plays: the source notices a new
//! generation number and recomputes its coefficients without a gap.

use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use rodio::source::SeekError;
use rodio::Source;

/// Band centre frequencies in Hz.
pub const BANDS: [f32; 10] = [32.0, 64.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0];
pub const MAX_GAIN_DB: f32 = 12.0;
const Q: f32 = 1.41;
/// How often (in frames) the source looks for new settings.
const CHECK_EVERY: u32 = 256;

/// Equaliser settings shared by the player and every playing source.
#[derive(Default)]
pub struct EqControl {
    generation: AtomicU64,
    gains: Mutex<[f32; 10]>,
}

impl EqControl {
    pub fn set(&self, gains: [f32; 10]) {
        let g = gains.map(|v| if v.is_finite() { v.clamp(-MAX_GAIN_DB, MAX_GAIN_DB) } else { 0.0 });
        if let Ok(mut cur) = self.gains.lock() {
            *cur = g;
        }
        self.generation.fetch_add(1, Ordering::Release);
    }

    pub fn gains(&self) -> [f32; 10] {
        self.gains.lock().map(|g| *g).unwrap_or_default()
    }

    fn generation(&self) -> u64 {
        self.generation.load(Ordering::Acquire)
    }
}

/// A level in dB that a source follows smoothly (Sound Check, later crossfade).
#[derive(Default)]
pub struct Level(AtomicU32);

impl Level {
    pub fn new(db: f32) -> Arc<Self> {
        let l = Arc::new(Self::default());
        l.set_db(db);
        l
    }
    pub fn set_db(&self, db: f32) {
        self.0.store(db.to_bits(), Ordering::Relaxed);
    }
    pub fn db(&self) -> f32 {
        f32::from_bits(self.0.load(Ordering::Relaxed))
    }
}

#[derive(Clone, Copy, Debug, Default)]
struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
}

impl Biquad {
    /// Peaking filter; `None` when it would do nothing (0 dB or above Nyquist).
    fn peaking(freq: f32, gain_db: f32, rate: u32) -> Option<Self> {
        if gain_db.abs() < 0.05 || freq >= rate as f32 * 0.45 {
            return None;
        }
        let a = 10f32.powf(gain_db / 40.0);
        let w0 = 2.0 * std::f32::consts::PI * freq / rate as f32;
        let alpha = w0.sin() / (2.0 * Q);
        let cos = w0.cos();
        let a0 = 1.0 + alpha / a;
        Some(Self {
            b0: (1.0 + alpha * a) / a0,
            b1: (-2.0 * cos) / a0,
            b2: (1.0 - alpha * a) / a0,
            a1: (-2.0 * cos) / a0,
            a2: (1.0 - alpha / a) / a0,
        })
    }

    /// Response in dB at `freq` (for tests).
    #[cfg(test)]
    fn response_db(&self, freq: f32, rate: u32) -> f32 {
        use std::f64::consts::PI;
        let w = 2.0 * PI * freq as f64 / rate as f64;
        let (c1, s1, c2, s2) = (w.cos(), -w.sin(), (2.0 * w).cos(), -(2.0 * w).sin());
        let num = (self.b0 as f64 + self.b1 as f64 * c1 + self.b2 as f64 * c2, self.b1 as f64 * s1 + self.b2 as f64 * s2);
        let den = (1.0 + self.a1 as f64 * c1 + self.a2 as f64 * c2, self.a1 as f64 * s1 + self.a2 as f64 * s2);
        let mag = (num.0 * num.0 + num.1 * num.1).sqrt() / (den.0 * den.0 + den.1 * den.1).sqrt();
        (20.0 * mag.log10()) as f32
    }
}

/// Filter memory of one band on one channel (transposed direct form II).
#[derive(Clone, Copy, Default)]
struct State {
    z1: f32,
    z2: f32,
}

/// Equaliser + level, wrapped around a decoder or a live stream.
pub struct Dsp<S: Source> {
    inner: S,
    eq: Arc<EqControl>,
    level: Arc<Level>,
    seen: u64,
    rate: u32,
    channels: u16,
    filters: Vec<Biquad>,
    /// filters.len() states per channel.
    states: Vec<State>,
    pre: f32,
    gain: f32,
    channel: usize,
    frames: u32,
}

impl<S: Source> Dsp<S> {
    pub fn new(inner: S, eq: Arc<EqControl>, level: Arc<Level>) -> Self {
        let gain = db_to_lin(level.db());
        let mut d = Self {
            rate: inner.sample_rate(),
            channels: inner.channels(),
            inner,
            eq,
            level,
            seen: u64::MAX,
            filters: Vec::new(),
            states: Vec::new(),
            pre: 1.0,
            gain,
            channel: 0,
            frames: 0,
        };
        d.refresh();
        d
    }

    fn refresh(&mut self) {
        self.seen = self.eq.generation();
        self.rate = self.inner.sample_rate().max(1);
        self.channels = self.inner.channels().max(1);
        let gains = self.eq.gains();
        let old = self.filters.len();
        self.filters = BANDS.iter().zip(gains).filter_map(|(&f, g)| Biquad::peaking(f, g, self.rate)).collect();
        if self.filters.len() != old || self.states.len() != self.filters.len() * self.channels as usize {
            self.states = vec![State::default(); self.filters.len() * self.channels as usize];
        }
        // Headroom for boosts, so a boosted preset distorts as little as possible.
        let boost = gains.iter().cloned().fold(0f32, f32::max);
        self.pre = db_to_lin(-boost * 0.75);
    }
}

fn db_to_lin(db: f32) -> f32 {
    10f32.powf(db / 20.0)
}

/// Gentle limiter above 0.8 so peaks round off instead of clipping hard.
fn soft_clip(x: f32) -> f32 {
    let a = x.abs();
    if a <= 0.8 {
        x
    } else {
        x.signum() * (0.8 + 0.2 * ((a - 0.8) / 0.2).tanh())
    }
}

impl<S: Source> Iterator for Dsp<S> {
    type Item = f32;

    fn next(&mut self) -> Option<f32> {
        if self.channel == 0 {
            self.frames = self.frames.wrapping_add(1);
            if self.frames % CHECK_EVERY == 0 {
                if self.eq.generation() != self.seen
                    || self.inner.sample_rate() != self.rate
                    || self.inner.channels() != self.channels
                {
                    self.refresh();
                }
            }
        }
        let x = self.inner.next()?;
        // Follow level changes over ~50 ms instead of jumping (no clicks).
        let target = db_to_lin(self.level.db());
        self.gain += (target - self.gain) * 0.0005;
        let mut y = x * self.gain;
        if !self.filters.is_empty() {
            y *= self.pre;
            let n = self.filters.len();
            let base = self.channel.min(self.channels as usize - 1) * n;
            for (i, f) in self.filters.iter().enumerate() {
                let s = &mut self.states[base + i];
                let out = f.b0 * y + s.z1;
                s.z1 = f.b1 * y - f.a1 * out + s.z2;
                s.z2 = f.b2 * y - f.a2 * out;
                y = out;
            }
        }
        self.channel += 1;
        if self.channel >= self.channels as usize {
            self.channel = 0;
        }
        Some(if self.filters.is_empty() && self.gain <= 1.0 { y } else { soft_clip(y) })
    }
}

impl<S: Source> Source for Dsp<S> {
    fn current_span_len(&self) -> Option<usize> {
        self.inner.current_span_len()
    }
    fn channels(&self) -> rodio::ChannelCount {
        self.inner.channels()
    }
    fn sample_rate(&self) -> rodio::SampleRate {
        self.inner.sample_rate()
    }
    fn total_duration(&self) -> Option<Duration> {
        self.inner.total_duration()
    }
    fn try_seek(&mut self, pos: Duration) -> Result<(), SeekError> {
        self.inner.try_seek(pos)?;
        for s in &mut self.states {
            *s = State::default();
        }
        self.channel = 0;
        Ok(())
    }
}

/// Sound Check level for a song: the gain (dB) that brings its loudness to a
/// common reference. Measured like ReplayGain in spirit: RMS of 50 ms blocks,
/// the loud end (95th percentile) taken as the song's loudness.
pub fn analyze_loudness<S: Source>(src: S, max_seconds: u32) -> Option<f32> {
    let rate = src.sample_rate().max(1) as usize;
    let ch = src.channels().max(1) as usize;
    let block = rate / 20 * ch;
    let limit = rate * ch * max_seconds as usize;
    let mut blocks: Vec<f32> = Vec::new();
    let (mut sum, mut n) = (0f64, 0usize);
    for (i, s) in src.enumerate() {
        if i >= limit {
            break;
        }
        sum += (s as f64) * (s as f64);
        n += 1;
        if n == block {
            blocks.push((sum / n as f64) as f32);
            sum = 0.0;
            n = 0;
        }
    }
    loudness_gain(&mut blocks)
}

/// Gain in dB from the mean-square values of 50 ms blocks.
pub fn loudness_gain(blocks: &mut [f32]) -> Option<f32> {
    let mut b: Vec<f32> = blocks.iter().cloned().filter(|v| *v > 1e-8).collect();
    if b.len() < 10 {
        return None;
    }
    b.sort_by(|a, c| a.partial_cmp(c).unwrap_or(std::cmp::Ordering::Equal));
    let ms = b[(b.len() as f32 * 0.95) as usize - 1];
    let db = 10.0 * ms.log10();
    Some((REFERENCE_DB - db).clamp(-12.0, 9.0))
}

/// Target loudness (dBFS RMS of the loud passages).
const REFERENCE_DB: f32 = -14.0;

#[cfg(test)]
mod tests {
    use super::*;
    use rodio::buffer::SamplesBuffer;

    #[test]
    fn peaking_filter_hits_its_gain_at_the_centre() {
        for &g in &[6.0f32, -6.0, 12.0] {
            let f = Biquad::peaking(1000.0, g, 44100).unwrap();
            assert!((f.response_db(1000.0, 44100) - g).abs() < 0.1);
            // Far away it does almost nothing.
            assert!(f.response_db(20.0, 44100).abs() < 0.5);
        }
        assert!(Biquad::peaking(1000.0, 0.0, 44100).is_none());
        assert!(Biquad::peaking(16000.0, 6.0, 22050).is_none());
    }

    fn sine(freq: f32, amp: f32, secs: f32, rate: u32) -> Vec<f32> {
        let n = (secs * rate as f32) as usize;
        (0..n).flat_map(|i| {
            let v = amp * (2.0 * std::f32::consts::PI * freq * i as f32 / rate as f32).sin();
            [v, v]
        }).collect()
    }

    fn rms(v: &[f32]) -> f32 {
        (v.iter().map(|x| x * x).sum::<f32>() / v.len() as f32).sqrt()
    }

    #[test]
    fn equaliser_changes_the_level_of_its_band() {
        let eq = Arc::new(EqControl::default());
        let mut g = [0.0; 10];
        g[0] = 12.0; // 32 Hz up
        eq.set(g);
        let low = sine(32.0, 0.1, 1.0, 44100);
        let high = sine(4000.0, 0.1, 1.0, 44100);
        let out_low: Vec<f32> = Dsp::new(SamplesBuffer::new(2, 44100, low.clone()), eq.clone(), Level::new(0.0)).collect();
        let out_high: Vec<f32> = Dsp::new(SamplesBuffer::new(2, 44100, high.clone()), eq.clone(), Level::new(0.0)).collect();
        let tail = |v: &Vec<f32>| rms(&v[v.len() / 2..]);
        let up = 20.0 * (tail(&out_low) / rms(&low)).log10();
        let flat = 20.0 * (tail(&out_high) / rms(&high)).log10();
        // +12 dB band with 9 dB headroom taken off: about +3 dB vs. -9 dB elsewhere.
        assert!(up - flat > 10.0, "band {up} other {flat}");
    }

    #[test]
    fn equaliser_settings_apply_while_playing() {
        let eq = Arc::new(EqControl::default());
        let src = SamplesBuffer::new(2, 44100, sine(1000.0, 0.1, 2.0, 44100));
        let mut d = Dsp::new(src, eq.clone(), Level::new(0.0));
        let first: Vec<f32> = d.by_ref().take(44100).collect();
        let mut g = [0.0; 10];
        g[5] = -12.0;
        eq.set(g);
        let rest: Vec<f32> = d.collect();
        assert!(rms(&rest[rest.len() / 2..]) < rms(&first) * 0.4);
    }

    #[test]
    fn level_follows_smoothly() {
        let eq = Arc::new(EqControl::default());
        let level = Level::new(0.0);
        let src = SamplesBuffer::new(1, 8000, vec![0.5; 16000]);
        let mut d = Dsp::new(src, eq, level.clone());
        level.set_db(-6.0);
        let first = d.next().unwrap();
        assert!((first - 0.5).abs() < 0.01, "no jump");
        let last = d.last().unwrap();
        assert!((last - 0.25).abs() < 0.01, "{last}");
    }

    #[test]
    fn loud_and_quiet_songs_get_opposite_gains() {
        let quiet = analyze_loudness(SamplesBuffer::new(2, 44100, sine(440.0, 0.05, 3.0, 44100)), 60).unwrap();
        let loud = analyze_loudness(SamplesBuffer::new(2, 44100, sine(440.0, 0.9, 3.0, 44100)), 60).unwrap();
        assert!(quiet > 3.0 && loud < 0.0, "quiet {quiet} loud {loud}");
        assert!(analyze_loudness(SamplesBuffer::new(2, 44100, vec![0.0; 44100]), 60).is_none());
    }
}
