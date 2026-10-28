//! Cover pictures from open, free sources only (no paid or store catalogues):
//!
//! 1. MusicBrainz + Cover Art Archive — the open music encyclopedia and its
//!    community-run image archive (metadata CC0, no key needed).
//! 2. TheAudioDB — community-built music database, free public API key.
//! 3. Wikipedia — the picture from the album's or song's article.
//!
//! Each source is tried in that order; the caller downloads and caches.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::art::match_score;

const USER_AGENT: &str = concat!("WheelDesk/", env!("CARGO_PKG_VERSION"), " (desktop music player; https://igumenov.lt)");
/// TheAudioDB's public key for free use.
const TADB_KEY: &str = "123";

pub fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new().timeout(Duration::from_secs(10)).user_agent(USER_AGENT).build()
}

pub fn encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            b' ' => out.push_str("%20"),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn get_json(agent: &ureq::Agent, url: &str) -> Option<serde_json::Value> {
    agent.get(url).call().ok()?.into_json().ok()
}

static MB_LAST: Mutex<Option<Instant>> = Mutex::new(None);

/// MusicBrainz allows one request per second per application.
fn mb_wait() {
    let mut last = MB_LAST.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(t) = *last {
        let since = t.elapsed();
        if since < Duration::from_millis(1100) {
            std::thread::sleep(Duration::from_millis(1100) - since);
        }
    }
    *last = Some(Instant::now());
}

fn lucene(s: &str) -> String {
    s.chars().filter(|c| !"+-&|!(){}[]^\"~*?:\\/".contains(*c)).collect()
}

fn credit_score(v: &serde_json::Value, artist: &str) -> u8 {
    v["artist-credit"]
        .as_array()
        .map(|c| c.iter().map(|x| match_score(x["name"].as_str().unwrap_or(""), artist)).max().unwrap_or(0))
        .unwrap_or(0)
}

// ------------------------------------------------------------ MusicBrainz / CAA

/// Release-group ids for an album, best match first.
pub fn pick_mb_release_groups(json: &serde_json::Value, artist: &str, album: &str) -> Vec<String> {
    let Some(groups) = json["release-groups"].as_array() else { return Vec::new() };
    let mut scored: Vec<(u8, u8, &str)> = groups
        .iter()
        .filter_map(|g| Some((match_score(g["title"].as_str()?, album), credit_score(g, artist), g["id"].as_str()?)))
        .filter(|(t, a, _)| *t > 0 && *a > 0)
        .collect();
    scored.sort_by(|x, y| (y.0, y.1).cmp(&(x.0, x.1)));
    scored.into_iter().map(|(_, _, id)| id.to_string()).collect()
}

/// Release ids for a recording, best match first.
pub fn pick_mb_releases(json: &serde_json::Value, artist: &str, title: &str) -> Vec<String> {
    let mut out = Vec::new();
    let Some(recs) = json["recordings"].as_array() else { return out };
    let mut scored: Vec<(u8, u8, &serde_json::Value)> = recs
        .iter()
        .map(|r| (match_score(r["title"].as_str().unwrap_or(""), title), credit_score(r, artist), r))
        .filter(|(t, a, _)| *t > 0 && *a > 0)
        .collect();
    scored.sort_by(|x, y| (y.0, y.1).cmp(&(x.0, x.1)));
    for (_, _, r) in scored {
        for rel in r["releases"].as_array().into_iter().flatten() {
            if let Some(id) = rel["id"].as_str() {
                if !out.iter().any(|x| x == id) {
                    out.push(id.to_string());
                }
            }
        }
    }
    out
}

/// Front picture from a Cover Art Archive listing.
pub fn pick_caa_front(json: &serde_json::Value) -> Option<String> {
    let images = json["images"].as_array()?;
    let img = images.iter().find(|i| i["front"].as_bool() == Some(true)).or(images.first())?;
    let url = img["thumbnails"]["500"].as_str().or(img["thumbnails"]["large"].as_str()).or(img["image"].as_str())?;
    Some(url.replace("http://", "https://"))
}

fn caa(agent: &ureq::Agent, kind: &str, id: &str) -> Option<String> {
    pick_caa_front(&get_json(agent, &format!("https://coverartarchive.org/{kind}/{id}"))?)
}

fn mb_album(agent: &ureq::Agent, artist: &str, album: &str) -> Option<String> {
    let q = format!("releasegroup:\"{}\" AND artist:\"{}\"", lucene(album), lucene(artist));
    mb_wait();
    let json = get_json(agent, &format!("https://musicbrainz.org/ws/2/release-group?query={}&fmt=json&limit=10", encode(&q)))?;
    pick_mb_release_groups(&json, artist, album).into_iter().take(3).find_map(|id| caa(agent, "release-group", &id))
}

fn mb_song(agent: &ureq::Agent, artist: &str, title: &str) -> Option<String> {
    let q = format!("recording:\"{}\" AND artist:\"{}\"", lucene(title), lucene(artist));
    mb_wait();
    let json = get_json(agent, &format!("https://musicbrainz.org/ws/2/recording?query={}&fmt=json&limit=10", encode(&q)))?;
    pick_mb_releases(&json, artist, title).into_iter().take(4).find_map(|id| caa(agent, "release", &id))
}

// ------------------------------------------------------------ TheAudioDB

pub fn pick_tadb_album(json: &serde_json::Value, artist: &str, album: &str) -> Option<String> {
    json["album"]
        .as_array()?
        .iter()
        .filter(|a| match_score(a["strAlbum"].as_str().unwrap_or(""), album) > 0)
        .filter(|a| match_score(a["strArtist"].as_str().unwrap_or(""), artist) > 0)
        .max_by_key(|a| match_score(a["strAlbum"].as_str().unwrap_or(""), album))
        .and_then(|a| a["strAlbumThumb"].as_str().filter(|u| u.starts_with("http")).map(String::from))
}

/// (track picture, album id) of the best matching track.
pub fn pick_tadb_track(json: &serde_json::Value, artist: &str, title: &str) -> Option<(Option<String>, Option<String>)> {
    let t = json["track"]
        .as_array()?
        .iter()
        .filter(|t| match_score(t["strTrack"].as_str().unwrap_or(""), title) > 0)
        .filter(|t| match_score(t["strArtist"].as_str().unwrap_or(""), artist) > 0)
        .max_by_key(|t| match_score(t["strTrack"].as_str().unwrap_or(""), title))?;
    let thumb = t["strTrackThumb"].as_str().filter(|u| u.starts_with("http")).map(String::from);
    let album = t["idAlbum"].as_str().map(String::from);
    Some((thumb, album))
}

fn tadb_album(agent: &ureq::Agent, artist: &str, album: &str) -> Option<String> {
    let url = format!(
        "https://www.theaudiodb.com/api/v1/json/{TADB_KEY}/searchalbum.php?s={}&a={}",
        encode(artist),
        encode(album)
    );
    pick_tadb_album(&get_json(agent, &url)?, artist, album)
}

fn tadb_song(agent: &ureq::Agent, artist: &str, title: &str) -> Option<String> {
    let url = format!(
        "https://www.theaudiodb.com/api/v1/json/{TADB_KEY}/searchtrack.php?s={}&t={}",
        encode(artist),
        encode(title)
    );
    let (thumb, album) = pick_tadb_track(&get_json(agent, &url)?, artist, title)?;
    if thumb.is_some() {
        return thumb;
    }
    let json = get_json(agent, &format!("https://www.theaudiodb.com/api/v1/json/{TADB_KEY}/album.php?m={}", album?))?;
    json["album"].as_array()?.first()?["strAlbumThumb"].as_str().filter(|u| u.starts_with("http")).map(String::from)
}

// ------------------------------------------------------------ Wikipedia

/// Picture of the article that is about this album/song by this artist.
pub fn pick_wikipedia(json: &serde_json::Value, artist: &str, name: &str) -> Option<String> {
    let pages = json["query"]["pages"].as_object()?;
    let mut best: Option<(u8, u32, String)> = None;
    for p in pages.values() {
        let title = p["title"].as_str().unwrap_or("");
        // "Album (Artist album)" → compare the part before the brackets.
        let bare = title.split(" (").next().unwrap_or(title);
        let score = match_score(bare, name);
        if score < 2 {
            continue;
        }
        let about = format!("{} {}", title, p["description"].as_str().unwrap_or("")).to_lowercase();
        let by_artist = about.contains(&artist.to_lowercase()) || match_score(&about, artist) > 0;
        if !by_artist {
            continue;
        }
        let Some(src) = p["thumbnail"]["source"].as_str() else { continue };
        let rank = p["index"].as_u64().unwrap_or(99) as u32;
        if best.as_ref().is_none_or(|(s, r, _)| (score, u32::MAX - rank) > (*s, u32::MAX - *r)) {
            best = Some((score, rank, src.to_string()));
        }
    }
    best.map(|(_, _, u)| u)
}

fn wikipedia(agent: &ureq::Agent, artist: &str, name: &str, kind: &str) -> Option<String> {
    let q = format!("{name} {artist} {kind}");
    let url = format!(
        "https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=5&gsrsearch={}&prop=pageimages%7Cdescription&piprop=thumbnail&pithumbsize=500",
        encode(&q)
    );
    pick_wikipedia(&get_json(agent, &url)?, artist, name)
}

// ------------------------------------------------------------ entry points

/// Cover for an album: each source in turn; `fetch` downloads a picture
/// address and says whether it worked.
pub fn album<T>(agent: &ureq::Agent, artist: &str, album: &str, mut fetch: impl FnMut(&str) -> Option<T>) -> Option<T> {
    if let Some(found) = mb_album(agent, artist, album).and_then(|u| fetch(&u)) {
        return Some(found);
    }
    if let Some(found) = tadb_album(agent, artist, album).and_then(|u| fetch(&u)) {
        return Some(found);
    }
    wikipedia(agent, artist, album, "album").and_then(|u| fetch(&u))
}

/// Cover picture address for a song (radio): its album's cover.
pub fn song(agent: &ureq::Agent, artist: &str, title: &str) -> Option<String> {
    mb_song(agent, artist, title)
        .or_else(|| tadb_song(agent, artist, title))
        .or_else(|| wikipedia(agent, artist, title, "song"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn musicbrainz_album_and_song_matches() {
        let rg = json!({"release-groups": [
            {"id": "wrong", "title": "Other", "artist-credit": [{"name": "Kino"}]},
            {"id": "deluxe", "title": "Gruppa krovi (Deluxe)", "artist-credit": [{"name": "Kino"}]},
            {"id": "right", "title": "Gruppa Krovi", "artist-credit": [{"name": "Кино"}, {"name": "Kino"}]}
        ]});
        assert_eq!(pick_mb_release_groups(&rg, "Kino", "Gruppa krovi"), ["right", "deluxe"]);
        let rec = json!({"recordings": [
            {"title": "Laivai", "artist-credit": [{"name": "Andrius Mamontovas"}], "releases": [{"id": "rel-1"}, {"id": "rel-2"}]},
            {"title": "Laivai (live)", "artist-credit": [{"name": "Andrius Mamontovas"}], "releases": [{"id": "live-1"}, {"id": "rel-1"}]},
            {"title": "Laivai", "artist-credit": [{"name": "Kitas"}], "releases": [{"id": "x"}]}
        ]});
        assert_eq!(pick_mb_releases(&rec, "Andrius Mamontovas", "Laivai"), ["rel-1", "rel-2", "live-1"]);
        let caa = json!({"images": [
            {"front": false, "image": "http://a/back.jpg", "thumbnails": {}},
            {"front": true, "image": "http://a/front.jpg", "thumbnails": {"500": "http://a/front-500.jpg"}}
        ]});
        assert_eq!(pick_caa_front(&caa).as_deref(), Some("https://a/front-500.jpg"));
    }

    #[test]
    fn audiodb_matches() {
        let a = json!({"album": [
            {"strAlbum": "Something Else", "strArtist": "Band", "strAlbumThumb": "https://t/1.jpg"},
            {"strAlbum": "Record", "strArtist": "The Band", "strAlbumThumb": "https://t/2.jpg"}
        ]});
        assert_eq!(pick_tadb_album(&a, "Band", "Record").as_deref(), Some("https://t/2.jpg"));
        assert!(pick_tadb_album(&json!({"album": null}), "Band", "Record").is_none());
        let t = json!({"track": [{"strTrack": "Song", "strArtist": "Band", "strTrackThumb": null, "idAlbum": "77"}]});
        assert_eq!(pick_tadb_track(&t, "band", "song"), Some((None, Some("77".to_string()))));
    }

    #[test]
    fn wikipedia_takes_the_article_about_that_album() {
        let w = json!({"query": {"pages": {
            "1": {"title": "Record (song)", "index": 1, "description": "song by Someone", "thumbnail": {"source": "https://w/a.jpg"}},
            "2": {"title": "Record (The Band album)", "index": 2, "description": "1999 studio album by The Band", "thumbnail": {"source": "https://w/b.jpg"}},
            "3": {"title": "Band", "index": 3, "thumbnail": {"source": "https://w/c.jpg"}}
        }}});
        assert_eq!(pick_wikipedia(&w, "The Band", "Record").as_deref(), Some("https://w/b.jpg"));
        assert!(pick_wikipedia(&w, "Nobody", "Record").is_none());
    }

    #[test]
    fn encodes_query_text() {
        assert_eq!(encode("AC/DC & Co"), "AC%2FDC%20%26%20Co");
    }
}
