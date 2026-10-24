//! Internet radio stations from fm.lt. The list (names, genres, descriptions,
//! pictures) and stream addresses are read from fm.lt itself; when a station
//! page does not reveal a playable address, the open radio-browser.info
//! database is asked by station name. Results are cached for a few days.

use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::art::match_score;

const FM_LT: &str = "https://fm.lt";
const USER_AGENT: &str = concat!("WheelDesk/", env!("CARGO_PKG_VERSION"), " (desktop music player)");
const CACHE_TTL_SECS: u64 = 3 * 24 * 3600;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Station {
    pub slug: String,
    pub name: String,
    #[serde(default)]
    pub country: String,
    #[serde(default)]
    pub country_code: String,
    pub genre: String,
    pub description: String,
    pub page_url: String,
    pub stream_url: Option<String>,
    pub image: Option<String>,
}

/// Stations as listed on fm.lt (October 2026), used until the live list loads
/// and whenever fm.lt cannot be reached. Order follows the site.
const SEED: &[(&str, &str, &str)] = &[
    ("neringa-fm", "Neringa FM", "Pop"),
    ("ziniu-radijas", "Å½iniÅ³ radijas", "Pokalbiai"),
    ("gold-fm", "Gold FM", "Retro"),
    ("lietus", "Lietus", "LietuviÅ¡ka"),
    ("lrt-radijas", "LRT Radijas", "Pokalbiai"),
    ("m-1", "M-1", "Pop"),
    ("radiocentras", "Radiocentras", "Pop"),
    ("european-hit-radio", "European Hit Radio", "Pop"),
    ("lrt-opus", "LRT Opus", "Alternatyvi"),
    ("radio-vilnius", "Radio Vilnius", "Alternatyvi"),
    ("laluna", "Laluna Radijas", "Pop"),
    ("pukas", "PÅ«kas", "LietuviÅ¡ka"),
    ("relax-fm", "Relax FM", "Rami muzika"),
    ("lrt-klasika", "LRT Klasika", "Klasika"),
    ("relax-fm-100-hitu", "Relax FM 100 HITÅ²", "LietuviÅ¡ka"),
    ("extra-fm", "Extra FM", "Pop"),
    ("m-1-plius", "M-1 Plius", "Pop"),
    ("easy-fm", "Easy FM", "Rami muzika"),
    ("relax-fm-sentimentai", "Relax FM Sentimentai", "Retro"),
    ("radio-3", "Radio 3", "Pop"),
];

/// fm.lt paths that are site pages, not stations.
const NOT_STATIONS: &[&str] = &[
    "apie", "kontaktai", "reklama", "privatumo-politika", "slapuku-politika", "naudojimo-taisykles", "taisykles",
    "naujienos", "paieska", "stotys", "zanrai", "miestai", "grojarastis", "top", "login", "prisijungti",
    "registracija", "api", "wp-content", "wp-admin", "assets", "static", "img", "images", "css", "js", "en", "lt",
    "ru", "sitemap", "rss", "feed", "dazniai", "radijo-stotys", "visos-stotys",
];

fn seed_station(slug: &str, name: &str, genre: &str) -> Station {
    Station {
        slug: slug.into(),
        name: name.into(),
        country: "Lietuva".into(),
        country_code: "LT".into(),
        genre: genre.into(),
        description: String::new(),
        page_url: format!("{FM_LT}/{slug}"),
        stream_url: None,
        image: None,
    }
}

pub fn seed() -> Vec<Station> {
    SEED.iter().map(|(s, n, g)| seed_station(s, n, g)).collect()
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(12))
        .user_agent(USER_AGENT)
        .build()
}

fn get_text(agent: &ureq::Agent, url: &str) -> Option<String> {
    let mut s = String::new();
    agent.get(url).call().ok()?.into_reader().take(4 * 1024 * 1024).read_to_string(&mut s).ok()?;
    Some(s)
}

// ------------------------------------------------------------------ HTML helpers

fn decode_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#039;", "'")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
}

fn strip_tags(s: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => {
                in_tag = true;
                out.push(' ');
            }
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    decode_entities(&out).split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Value of a <meta property|name="key" content="..."> tag.
pub fn meta_content(html: &str, key: &str) -> Option<String> {
    let mut rest = html;
    while let Some(i) = rest.find("<meta") {
        let tag_end = rest[i..].find('>').map(|j| i + j).unwrap_or(rest.len());
        let tag = &rest[i..tag_end];
        let has_key = [format!("property=\"{key}\""), format!("name=\"{key}\""), format!("property='{key}'"), format!("name='{key}'")]
            .iter()
            .any(|k| tag.contains(k.as_str()));
        if has_key {
            for q in ['"', '\''] {
                let pat = format!("content={q}");
                if let Some(c) = tag.find(&pat) {
                    let v = &tag[c + pat.len()..];
                    if let Some(e) = v.find(q) {
                        let val = decode_entities(v[..e].trim());
                        if !val.is_empty() {
                            return Some(val);
                        }
                    }
                }
            }
        }
        rest = &rest[tag_end.min(rest.len())..];
        if tag_end >= html.len() {
            break;
        }
    }
    None
}

fn slug_from_href(href: &str) -> Option<String> {
    let h = href.trim();
    let path = h
        .strip_prefix("https://fm.lt")
        .or_else(|| h.strip_prefix("http://fm.lt"))
        .or_else(|| h.strip_prefix("//fm.lt"))
        .unwrap_or(h);
    let path = path.strip_prefix('/')?.trim_end_matches('/');
    if path.is_empty() || path.contains('/') || path.contains('?') || path.contains('#') || path.contains('.') {
        return None;
    }
    let ok = path.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    (ok && !NOT_STATIONS.contains(&path)).then(|| path.to_string())
}

/// Station links on the fm.lt front page, in page order: (slug, visible name).
pub fn parse_station_links(html: &str) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    let mut rest = html;
    while let Some(i) = rest.find("<a") {
        let after = &rest[i..];
        let Some(tag_end) = after.find('>') else { break };
        let tag = &after[..tag_end];
        let close = after.find("</a>").unwrap_or(tag_end);
        let inner = if close > tag_end { &after[tag_end + 1..close] } else { "" };
        let href = ["href=\"", "href='"].iter().find_map(|p| {
            let s = tag.find(p)? + p.len();
            let q = tag.as_bytes()[s - 1] as char;
            let e = tag[s..].find(q)?;
            Some(&tag[s..s + e])
        });
        if let Some(slug) = href.and_then(slug_from_href) {
            let mut name = strip_tags(inner);
            if name.is_empty() {
                // Logo-only links: use the image's alt text or the link title.
                name = ["alt=\"", "title=\""]
                    .iter()
                    .find_map(|p| {
                        let src = format!("{tag}{inner}");
                        let s = src.find(p)? + p.len();
                        let e = src[s..].find('"')?;
                        Some(decode_entities(&src[s..s + e]))
                    })
                    .unwrap_or_default();
            }
            match out.iter_mut().find(|(s, _)| *s == slug) {
                Some(entry) if entry.1.is_empty() || entry.1.len() > 60 => entry.1 = name,
                Some(_) => {}
                None => out.push((slug, name)),
            }
        }
        rest = &after[close.max(tag_end).min(after.len())..];
        if rest.len() == after.len() {
            rest = &after[2..];
        }
    }
    out
}

/// Every audio stream address that appears in a page (HTML or embedded JSON),
/// best first.
pub fn find_stream_urls(html: &str) -> Vec<String> {
    let text = decode_entities(&html.replace("\\/", "/").replace("\\u0026", "&"));
    let mut found: Vec<(i32, String)> = Vec::new();
    let mut rest = text.as_str();
    while let Some(i) = rest.find("http") {
        let cand = &rest[i..];
        let end = cand
            .find(|c: char| c.is_whitespace() || matches!(c, '"' | '\'' | '<' | '>' | '\\' | ')' | ',' | '`' | '{' | '}' | '['  | ']'))
            .unwrap_or(cand.len());
        let url = &cand[..end];
        rest = &cand[end.max(4)..];
        if !(url.starts_with("http://") || url.starts_with("https://")) {
            continue;
        }
        let l = url.to_ascii_lowercase();
        let path = l.split('?').next().unwrap_or(&l);
        let skip_ext = [".js", ".css", ".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif", ".ico", ".woff", ".woff2", ".html", ".php", ".json", ".xml"];
        if skip_ext.iter().any(|e| path.ends_with(e)) || l.contains("fm.lt/") && !l.contains("stream") {
            continue;
        }
        let mut score = 0;
        if [".mp3", ".aac", ".aacp", ".m3u8", ".pls", ".m3u", ".ogg", ".opus"].iter().any(|e| path.ends_with(e)) {
            score += 6;
        }
        for (needle, pts) in [("stream", 4), ("icecast", 4), ("shoutcast", 4), ("/live", 2), ("radio", 1), ("listen", 2), ("audio", 1)] {
            if l.contains(needle) {
                score += pts;
            }
        }
        let host_port = l.split("://").nth(1).and_then(|h| h.split('/').next()).unwrap_or("");
        if host_port.contains(':') {
            score += 3; // Icecast/Shoutcast servers usually run on their own port
        }
        if l.starts_with("https://") {
            score += 1;
        }
        if ["facebook", "instagram", "twitter", "youtube", "google", "apple.com/app", "play.google", "spotify", "tiktok"].iter().any(|s| l.contains(s)) {
            continue;
        }
        if score >= 5 && !found.iter().any(|(_, u)| u == url) {
            found.push((score, url.to_string()));
        }
    }
    found.sort_by(|a, b| b.0.cmp(&a.0));
    found.into_iter().map(|(_, u)| u).collect()
}

// ------------------------------------------------------------------ list and details

/// Station list: live from fm.lt (in site order) with the built-in list filling
/// in genres and anything the page did not show.
pub fn fetch_list() -> Vec<Station> {
    let mut list = seed();
    let Some(html) = get_text(&agent(), &format!("{FM_LT}/")) else {
        return list;
    };
    let links = parse_station_links(&html);
    if links.len() < 5 {
        return list; // page layout changed: keep the known list
    }
    let mut ordered: Vec<Station> = Vec::new();
    for (slug, name) in links {
        let mut st = list
            .iter()
            .position(|s| s.slug == slug)
            .map(|i| list.remove(i))
            .unwrap_or_else(|| seed_station(&slug, "", ""));
        if st.name.is_empty() && !name.is_empty() && name.len() <= 60 {
            st.name = name;
        }
        if st.name.is_empty() {
            st.name = slug.replace('-', " ");
        }
        ordered.push(st);
    }
    ordered.extend(list);
    ordered
}

#[derive(Default, Serialize, Deserialize)]
struct CacheEntry {
    at: u64,
    stream_url: Option<String>,
    description: String,
    image: Option<String>,
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn load_cache(dir: &Path) -> HashMap<String, CacheEntry> {
    fs::read_to_string(dir.join("radio-cache.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_cache(dir: &Path, cache: &HashMap<String, CacheEntry>) {
    let _ = fs::create_dir_all(dir);
    if let Ok(json) = serde_json::to_string(cache) {
        let _ = fs::write(dir.join("radio-cache.json"), json);
    }
}

/// Fills in description, picture and stream address for one station.
pub fn resolve(mut st: Station, cache_dir: &Path) -> Station {
    // Imported URLs are authoritative; never scrape a broadcaster's website or
    // replace them with a similarly named Lithuanian station from legacy cache.
    if st.slug.starts_with("m3u:") || st.stream_url.is_some() {
        return st;
    }
    let mut cache = load_cache(cache_dir);
    if let Some(c) = cache.get(&st.slug).filter(|c| now_secs().saturating_sub(c.at) < CACHE_TTL_SECS && c.stream_url.is_some()) {
        st.stream_url = c.stream_url.clone();
        st.description = c.description.clone();
        st.image = c.image.clone();
        return st;
    }
    let agent = agent();
    if let Some(html) = get_text(&agent, &st.page_url) {
        if let Some(d) = meta_content(&html, "og:description").or_else(|| meta_content(&html, "description")) {
            st.description = d;
        }
        st.image = meta_content(&html, "og:image");
        st.stream_url = find_stream_urls(&html).into_iter().next();
    }
    if st.stream_url.is_none() {
        st.stream_url = radio_browser(&agent, &st.name);
    }
    cache.insert(
        st.slug.clone(),
        CacheEntry { at: now_secs(), stream_url: st.stream_url.clone(), description: st.description.clone(), image: st.image.clone() },
    );
    save_cache(cache_dir, &cache);
    st
}

/// Forget a station's cached address (it stopped working).
pub fn forget(slug: &str, cache_dir: &Path) {
    let mut cache = load_cache(cache_dir);
    if cache.remove(slug).is_some() {
        save_cache(cache_dir, &cache);
    }
}

fn encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Stream address from the open radio-browser.info database (Lithuanian stations).
fn radio_browser(agent: &ureq::Agent, name: &str) -> Option<String> {
    for host in ["de1.api.radio-browser.info", "nl1.api.radio-browser.info", "at1.api.radio-browser.info"] {
        let url = format!(
            "https://{host}/json/stations/search?name={}&countrycode=LT&hidebroken=true&order=clickcount&reverse=true&limit=15",
            encode(name)
        );
        let Ok(resp) = agent.get(&url).call() else { continue };
        let Ok(json) = resp.into_json::<serde_json::Value>() else { continue };
        return pick_radio_browser(&json, name);
    }
    None
}

pub fn pick_radio_browser(json: &serde_json::Value, name: &str) -> Option<String> {
    json.as_array()?
        .iter()
        .filter_map(|s| {
            let codec = s["codec"].as_str().unwrap_or("").to_ascii_uppercase();
            let playable = codec.contains("MP3") || codec.contains("AAC") || codec.contains("OGG") || codec.is_empty();
            let url = s["url_resolved"].as_str().or(s["url"].as_str())?.to_string();
            let score = match_score(s["name"].as_str()?, name);
            (playable && score > 0).then_some((score, s["clickcount"].as_u64().unwrap_or(0), url))
        })
        .max_by_key(|(score, clicks, _)| (*score, *clicks))
        .map(|(_, _, url)| url)
}

// ------------------------------------------------------------------ song covers

/// "Artist - Title" as sent by stations; None for jingles, ads and the like.
pub fn split_title(s: &str) -> Option<(String, String)> {
    let s = s.trim();
    let (a, t) = [" - ", " â€“ ", " â€” ", " | "].iter().find_map(|sep| s.split_once(sep))?;
    let (a, t) = (a.trim(), t.trim());
    if a.is_empty() || t.is_empty() {
        return None;
    }
    let lower = s.to_lowercase();
    if ["reklama", "www.", "http", ".lt", "eteryje", "on air", "jingle"].iter().any(|w| lower.contains(w)) {
        return None;
    }
    Some((a.to_string(), t.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const FRONT: &str = r#"<html><body>
      <a href="/">fm.lt</a> <a href="/apie">Apie</a>
      <a class="card" href="https://fm.lt/neringa-fm"><img alt="Neringa FM" src="/img/n.png"></a>
      <a href="https://fm.lt/neringa-fm"><h3>Neringa FM</h3><span>Pop</span></a>
      <a href="/naujas-radijas/">Naujas &amp; Radijas</a>
      <a href="/gold-fm/grojarastis/">GrojaraÅ¡tis</a>
      <a href='https://fm.lt/gold-fm'>Gold FM</a>
      <a href="https://facebook.com/fm.lt">Facebook</a>
    </body></html>"#;

    #[test]
    fn reads_station_links_from_front_page() {
        let links = parse_station_links(FRONT);
        assert_eq!(
            links,
            vec![
                ("neringa-fm".to_string(), "Neringa FM".to_string()),
                ("naujas-radijas".to_string(), "Naujas & Radijas".to_string()),
                ("gold-fm".to_string(), "Gold FM".to_string()),
            ]
        );
    }

    #[test]
    fn reads_description_and_picture() {
        let html = r#"<head><meta property="og:description" content="PajÅ«rio &quot;nuotaikos&quot; radijas">
            <meta name="description" content="x"><meta property='og:image' content='https://fm.lt/i/n.jpg'></head>"#;
        assert_eq!(meta_content(html, "og:description").as_deref(), Some("PajÅ«rio \"nuotaikos\" radijas"));
        assert_eq!(meta_content(html, "og:image").as_deref(), Some("https://fm.lt/i/n.jpg"));
        assert_eq!(meta_content(html, "keywords"), None);
    }

    #[test]
    fn finds_stream_address_in_page_and_json() {
        let html = r#"<script src="https://fm.lt/app.js"></script>
          <img src="https://cdn.example/logo.png">
          <a href="https://www.facebook.com/x">fb</a>
          <script>window.__DATA__={"station":{"stream":"https:\/\/stream.example.lt:8443\/neringa128.mp3","page":"https:\/\/fm.lt\/neringa-fm"}}</script>"#;
        assert_eq!(find_stream_urls(html), vec!["https://stream.example.lt:8443/neringa128.mp3".to_string()]);
        let hls = r#"data-src="https://cdn.example/live/radio/playlist.m3u8?token=1&amp;x=2""#;
        assert_eq!(find_stream_urls(hls), vec!["https://cdn.example/live/radio/playlist.m3u8?token=1&x=2".to_string()]);
    }

    #[test]
    fn radio_browser_prefers_the_matching_station() {
        let json = serde_json::json!([
            {"name": "Relax FM Sentimentai", "url_resolved": "https://a/sent", "codec": "MP3", "clickcount": 900},
            {"name": "Relax FM", "url_resolved": "https://a/relax", "codec": "AAC+", "clickcount": 50},
            {"name": "Relax FM", "url_resolved": "https://a/relax-flac", "codec": "FLAC", "clickcount": 5000}
        ]);
        assert_eq!(pick_radio_browser(&json, "Relax FM").as_deref(), Some("https://a/relax"));
    }

    #[test]
    fn splits_song_titles_and_skips_ads() {
        assert_eq!(split_title("Jurga - Nebijok"), Some(("Jurga".into(), "Nebijok".into())));
        assert_eq!(split_title("Andrius Mamontovas â€“ Laivai"), Some(("Andrius Mamontovas".into(), "Laivai".into())));
        assert_eq!(split_title("Neringa FM"), None);
        assert_eq!(split_title("Reklama - www.neringafm.lt"), None);
    }


    #[test]
    fn seed_matches_the_site_list() {
        let s = seed();
        assert_eq!(s.len(), 20);
        assert_eq!(s[0].page_url, "https://fm.lt/neringa-fm");
        assert!(s.iter().all(|x| slug_from_href(&x.page_url).as_deref() == Some(x.slug.as_str())));
    }
}
