//! First known official album artwork from open metadata and freely licensed Commons files.
//! No commercial image catalogues, account, API key or arbitrary image search.
use std::{fs, path::Path, sync::Mutex, time::{Duration, Instant, SystemTime}};
use serde::{Deserialize, Serialize};
use serde_json::Value;

static MB_LAST: Mutex<Option<Instant>> = Mutex::new(None);
const MAX_JSON: u64 = 3 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OpenArtwork {
    pub image_url: String,
    pub source_url: String,
    pub artist: String,
    pub credit: String,
    pub license: String,
    pub license_url: String,
    pub album: String,
    pub release_date: String,
    pub release_url: String,
}

fn norm(s: &str) -> String { s.chars().filter(|c| c.is_alphanumeric()).flat_map(char::to_lowercase).collect() }
fn uuid(s: &str) -> bool { s.len() == 36 && s.chars().enumerate().all(|(i,c)| if [8,13,18,23].contains(&i) { c == '-' } else { c.is_ascii_hexdigit() }) }
fn qid(s: &str) -> bool { s.starts_with('Q') && s.len() > 1 && s[1..].chars().all(|c| c.is_ascii_digit()) }
fn encode(s: &str) -> String {
    s.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}
fn plain(s: &str) -> String {
    let mut in_tag = false;
    let mut text = String::new();
    for c in s.chars() {
        if c == '<' { in_tag = true; text.push(' '); }
        else if c == '>' { in_tag = false; text.push(' '); }
        else if !in_tag { text.push(c); }
    }
    text
        .replace("&amp;", "&").replace("&quot;", "\"").replace("&#39;", "'").replace("&lt;", "<").replace("&gt;", ">").split_whitespace().collect::<Vec<_>>().join(" ")
}
fn https_host(url: &str, host: &str) -> bool { url.starts_with(&format!("https://{host}/")) }

/// Only exact artist/title recordings. A same-name song by another artist is not a fallback.
fn recording_id(json: &Value, artist: &str, title: &str) -> Option<String> {
    let mut candidates: Vec<_> = json["recordings"].as_array()?.iter().filter(|r| {
        norm(r["title"].as_str().unwrap_or("")) == norm(title) &&
        r["artist-credit"].as_array().is_some_and(|a| a.iter().any(|a| norm(a["artist"]["name"].as_str().or(a["name"].as_str()).unwrap_or("")) == norm(artist)))
    }).collect();
    candidates.sort_by_key(|r| r["first-release-date"].as_str().filter(|s| !s.is_empty()).unwrap_or("9999"));
    candidates.into_iter().find_map(|r| r["id"].as_str().filter(|s| uuid(s)).map(String::from))
}

#[derive(Clone, Debug, PartialEq)]
struct FirstAlbum { group: String, title: String, date: String }
fn valid_date(s: &str) -> bool {
    s.is_ascii() && matches!(s.len(),4|7|10) && s[..4].chars().all(|c| c.is_ascii_digit()) && s[..4] >= *"1800" &&
    (s.len() < 7 || (&s[4..5] == "-" && matches!(s[5..7].parse::<u8>(),Ok(1..=12)))) &&
    (s.len() < 10 || (&s[7..8] == "-" && matches!(s[8..10].parse::<u8>(),Ok(1..=31))))
}
fn first_album(releases: &[Value]) -> Option<FirstAlbum> {
    releases.iter().filter_map(|r| {
        let group=&r["release-group"];
        if r["status"].as_str() != Some("Official") || group["primary-type"].as_str() != Some("Album") { return None; }
        if group["secondary-types"].as_array().is_some_and(|types| types.iter().any(|t|
            matches!(t.as_str(), Some("Compilation" | "Live" | "Remix" | "DJ-mix"))
        )) { return None; }
        let date=r["date"].as_str()?;
        let id=group["id"].as_str()?;
        if !valid_date(date) || !uuid(id) { return None; }
        Some(FirstAlbum {group:id.into(), title:group["title"].as_str().or(r["title"].as_str())?.into(),date:date.into()})
    }).min_by(|a,b| a.date.cmp(&b.date).then(a.group.cmp(&b.group)))
}

/// A Commons host alone is insufficient: require explicit libre licence metadata.
fn commons_art(json: &Value, album: &FirstAlbum) -> Option<OpenArtwork> {
    let pages=json["query"]["pages"].as_array()?;
    for page in pages {
        if page.get("missing").is_some() { continue; }
        let info=&page["imageinfo"][0]; let m=&info["extmetadata"];
        let value=|key: &str| m[key]["value"].as_str().unwrap_or("");
        let mut license_url=value("LicenseUrl").trim().replace("http://", "https://");
        if license_url.starts_with("//") { license_url=format!("https:{license_url}"); }
        if !license_url.ends_with('/') { license_url.push('/'); }
        let licence=match license_url.as_str() {
            "https://creativecommons.org/publicdomain/zero/1.0/" => "CC0-1.0".to_owned(),
            "https://creativecommons.org/publicdomain/mark/1.0/" if value("Copyrighted")=="False" => "Public domain".to_owned(),
            url => {
                let mut found=None;
                for kind in ["by","by-sa"] { for ver in ["2.0","2.5","3.0","4.0"] {
                    if url==format!("https://creativecommons.org/licenses/{kind}/{ver}/") {
                        found=Some(format!("CC-{}-{ver}",kind.to_uppercase()));
                    }
                }}
                let Some(lic)=found else { continue };lic
            }
        };
        if !value("Restrictions").trim().is_empty() { continue; }
        let author=plain(value("Artist"));
        if (licence.starts_with("CC-BY") && author.is_empty()) || value("LicenseShortName").contains("NC") || value("LicenseShortName").contains("ND") { continue; }
        let image=info["thumburl"].as_str().or(info["url"].as_str())?;
        let source=info["descriptionurl"].as_str()?;
        if !https_host(image,"upload.wikimedia.org") || !https_host(source,"commons.wikimedia.org") { continue; }
        if !matches!(info["mime"].as_str(),Some("image/jpeg"|"image/png"|"image/webp"|"image/svg+xml")) { continue; }
        return Some(OpenArtwork { image_url:image.into(),source_url:source.into(),artist:author,credit:plain(value("Credit")),license:licence,
            license_url,album:album.title.clone(),release_date:album.date.clone(),release_url:format!("https://musicbrainz.org/release-group/{}",album.group) });
    }
    None
}

fn resolve_with(artist: &str, title: &str, fetch: &mut impl FnMut(&str)->Option<Value>) -> Option<OpenArtwork> {
    if artist.trim().is_empty() || title.trim().is_empty() || artist.len()>300 || title.len()>500 { return None; }
    // Quote and strip Lucene operators from user metadata before URL encoding.
    let clean=|s:&str| s.chars().filter(|c| !"+-&|!(){}[]^\"~*?:\\/".contains(*c)).collect::<String>();
    let query=format!("recording:\"{}\" AND artist:\"{}\"",clean(title),clean(artist));
    let search=fetch(&format!("https://musicbrainz.org/ws/2/recording/?query={}&fmt=json&limit=25",encode(&query)))?;
    let id=recording_id(&search,artist,title)?;
    let mut releases=Vec::new();
    for page in 0..10 {
        let result=fetch(&format!("https://musicbrainz.org/ws/2/release?recording={id}&inc=release-groups&fmt=json&limit=100&offset={}",page*100))?;
        releases.extend(result["releases"].as_array()?.iter().cloned());
        let count=result["release-count"].as_u64()? as usize;
        if releases.len()>=count { break; }
        if page==9 { return None; } // Never label a truncated result as the first album.
    }
    let album=first_album(&releases)?;
    let group=fetch(&format!("https://musicbrainz.org/ws/2/release-group/{}?inc=url-rels&fmt=json",album.group))?;
    let entity=group["relations"].as_array()?.iter().find_map(|r| {
        if r["type"].as_str()!=Some("wikidata") { return None; }
        let url=r["url"]["resource"].as_str()?;
        let q=url.strip_prefix("https://www.wikidata.org/wiki/").or_else(|| url.strip_prefix("http://www.wikidata.org/wiki/"))?;
        qid(q).then(||q.to_owned())
    })?;
    let data=fetch(&format!("https://www.wikidata.org/wiki/Special:EntityData/{entity}.json"))?;
    let claims=data["entities"][&entity]["claims"]["P18"].as_array()?;
    // Use the artwork explicitly associated with this album, never an artist photo.
    for claim in claims {
        if claim["rank"].as_str()==Some("deprecated") {continue;}
        let Some(file)=claim["mainsnak"]["datavalue"]["value"].as_str() else {continue};
        let result=fetch(&format!("https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=url%7Cextmetadata%7Cmime&iiurlwidth=600&titles={}",encode(&format!("File:{file}"))))?;
        if let Some(art)=commons_art(&result,&album) { return Some(art); }
    }
    None
}

fn json_get(agent: &ureq::Agent, url: &str) -> Option<Value> {
    if url.starts_with("https://musicbrainz.org/") {
        let mut last=MB_LAST.lock().ok()?;
        if let Some(t)=*last { let elapsed=t.elapsed(); if elapsed<Duration::from_millis(1100) { std::thread::sleep(Duration::from_millis(1100)-elapsed); } }
        *last=Some(Instant::now());
    }
    let response=agent.get(url).call().ok()?;
    let mut bytes=Vec::new();
    use std::io::Read;
    response.into_reader().take(MAX_JSON+1).read_to_end(&mut bytes).ok()?;
    if bytes.len()>MAX_JSON as usize {return None;}
    serde_json::from_slice(&bytes).ok()
}

pub fn lookup(artist: &str, title: &str, cache: &Path) -> Option<OpenArtwork> {
    if artist.trim().is_empty() || title.trim().is_empty() {return None;}
    let mut hash=0xcbf29ce484222325_u64;
    for b in format!("{}\u{1f}{}",artist.trim().to_lowercase(),title.trim().to_lowercase()).bytes() {hash^=b as u64;hash=hash.wrapping_mul(0x100000001b3);}
    let dir=cache.join("open-art-v1");let file=dir.join(format!("{hash:016x}.json"));
    if let Ok(meta)=fs::metadata(&file) {
        if meta.modified().ok().and_then(|t|SystemTime::now().duration_since(t).ok()).is_some_and(|d|d<Duration::from_secs(86400)) {
            if let Ok(data)=fs::read(&file) { if let Ok(result)=serde_json::from_slice::<Option<OpenArtwork>>(&data) {return result;} }
        }
    }
    let agent=ureq::AgentBuilder::new().timeout(Duration::from_secs(8)).user_agent(concat!("WheelDesk/",env!("CARGO_PKG_VERSION")," (+https://github.com/A-Igumenov/WheelDesk; libre artwork lookup)")).build();
    let result=resolve_with(artist,title,&mut |url|json_get(&agent,url));
    let _=fs::create_dir_all(dir);
    if let Ok(data)=serde_json::to_vec(&result) {let _=fs::write(file,data);}
    result
}

#[cfg(test)]
mod tests {
    use super::*;use serde_json::json;
    const ID:&str="12345678-1234-1234-1234-123456789abc";
    fn release(date:&str,kind:&str,secondary:Vec<&str>)->Value {json!({"date":date,"status":"Official","release-group":{"id":ID,"title":"First Album","primary-type":kind,"secondary-types":secondary}})}
    fn album()->FirstAlbum {FirstAlbum{group:ID.into(),title:"First Album".into(),date:"1970".into()}}
    fn image(url:&str,author:&str)->Value {json!({"query":{"pages":[{"imageinfo":[{"url":"https://upload.wikimedia.org/original.jpg","thumburl":"https://upload.wikimedia.org/thumb.jpg","descriptionurl":"https://commons.wikimedia.org/wiki/File:Cover.jpg","mime":"image/jpeg","extmetadata":{"LicenseUrl":{"value":url},"LicenseShortName":{"value":"CC BY-SA 4.0"},"Artist":{"value":author},"Credit":{"value":"Original cover"}}}]}]}})}
    #[test]fn earliest_official_album_not_compilation_single_or_live(){
        let releases=vec![release("1960","Single",vec![]),release("1965","Album",vec!["Compilation"]),release("1966","Album",vec!["Live"]),release("1980","Album",vec![]),release("1970-02","Album",vec![])];
        assert_eq!(first_album(&releases).unwrap().date,"1970-02");
    }
    #[test]fn invalid_dates_and_bootlegs_are_not_original_albums(){let mut r=release("1970","Album",vec![]);r["status"]=json!("Bootleg");assert!(first_album(&[r,release("????","Album",vec![]),release("1970-99","Album",vec![]),release("☃a","Album",vec![])]).is_none());}
    #[test]fn exact_artist_and_recording_required(){let j=json!({"recordings":[{"id":ID,"title":"Song","artist-credit":[{"artist":{"name":"Other"}}]}]});assert!(recording_id(&j,"Artist","Song").is_none());}
    #[test]fn distinguishes_live_recordings(){let j=json!({"recordings":[{"id":ID,"title":"Song (Live)","artist-credit":[{"artist":{"name":"Artist"}}]}]});assert!(recording_id(&j,"Artist","Song").is_none());}
    #[test]fn accepts_by_sa_and_preserves_full_attribution(){let a=commons_art(&image("https://creativecommons.org/licenses/by-sa/4.0/","<a href='x'>Alice &amp; Bob</a>"),&album()).unwrap();assert_eq!(a.artist,"Alice & Bob");assert_eq!(plain("Alice<br/>Bob"),"Alice Bob");assert_eq!(a.license,"CC-BY-SA-4.0");assert_eq!(a.album,"First Album");assert!(a.release_url.ends_with(ID));}
    #[test]fn rejects_nonfree_and_unknown_licences(){for url in ["https://creativecommons.org/licenses/by-nc/4.0/","https://creativecommons.org/licenses/by-nd/4.0/","","https://example.test/mit"]{assert!(commons_art(&image(url,"Alice"),&album()).is_none());}}
    #[test]fn requires_author_for_attribution_licences(){assert!(commons_art(&image("https://creativecommons.org/licenses/by/4.0/",""),&album()).is_none());}
    #[test]fn rejects_arbitrary_image_hosts(){let mut j=image("https://creativecommons.org/publicdomain/zero/1.0/","Alice");j["query"]["pages"][0]["imageinfo"][0]["thumburl"]=json!("https://example.test/image.jpg");assert!(commons_art(&j,&album()).is_none());}
    #[test]fn rejects_extra_restrictions(){let mut j=image("https://creativecommons.org/licenses/by/4.0/","Alice");j["query"]["pages"][0]["imageinfo"][0]["extmetadata"]["Restrictions"]=json!({"value":"permission required"});assert!(commons_art(&j,&album()).is_none());}
    #[test]fn empty_metadata_never_calls_network(){let mut calls=0;assert!(resolve_with("","Song",&mut |_|{calls+=1;None}).is_none());assert_eq!(calls,0);}
    #[test]fn absent_recording_never_guesses_an_image(){let mut calls=0;assert!(resolve_with("Artist","Song",&mut |_|{calls+=1;Some(json!({"recordings":[]}))}).is_none());assert_eq!(calls,1);}
    #[test]fn resolves_complete_open_pipeline(){let mut urls=vec![];let result=resolve_with("Artist","Song",&mut |url|{urls.push(url.to_owned());Some(if url.contains("recording/?") {json!({"recordings":[{"id":ID,"title":"Song","artist-credit":[{"artist":{"name":"Artist"}}]}]})}else if url.contains("/release?"){json!({"release-count":1,"releases":[release("1970","Album",vec![])]})}else if url.contains("/release-group/"){json!({"relations":[{"type":"wikidata","url":{"resource":"https://www.wikidata.org/wiki/Q123"}}]})}else if url.contains("Special:EntityData"){json!({"entities":{"Q123":{"claims":{"P18":[{"mainsnak":{"datavalue":{"value":"Cover.jpg"}}}]}}}})}else{image("https://creativecommons.org/licenses/by/4.0/","Alice")})});assert!(result.is_some());assert_eq!(urls.len(),5);assert!(urls.iter().all(|u|["https://musicbrainz.org/","https://www.wikidata.org/","https://commons.wikimedia.org/"].iter().any(|h|u.starts_with(h))));}
}
