//! World radio station catalogue built into the app: broadcasters only, from
//! the Radio Browser archive export (see scripts/make-station-catalog.py). Stations are filtered
//! by country (ISO 3166-1 code) and by genre: the archive's free-form tags are
//! sorted into a short list of genres, a station may be in several.

use std::collections::HashMap;
use std::io::Read;
use std::sync::OnceLock;

use serde::Serialize;

use crate::radio::Station;

static DATA: &[u8] = include_bytes!("../data/stations.tsv.gz");

/// Genre ids in menu order. "other" collects stations whose tags fit none.
pub const GENRES: &[&str] = &[
    "pop", "rock", "alternative", "metal", "dance", "hiphop", "rnb", "jazz", "blues", "classical", "country", "folk",
    "latin", "reggae", "world", "oldies", "chill", "news", "sports", "religious", "kids", "culture", "other",
];

/// Tag words (whole tags or words inside them) that put a station in a genre.
const RULES: &[(&str, &[&str])] = &[
    ("pop", &["pop", "top 40", "top40", "hits", "chart", "charts", "adult contemporary", "ac", "hot ac", "mainstream", "schlager", "estrada", "kpop", "k-pop", "j-pop", "jpop", "cpop", "c-pop", "eurovision", "variety hits"]),
    ("rock", &["rock", "classic rock", "hard rock", "soft rock", "rock n roll", "rock'n'roll", "rockabilly", "progressive"]),
    ("alternative", &["alternative", "indie", "grunge", "new wave", "punk", "post-punk", "emo", "britpop", "shoegaze"]),
    ("metal", &["metal", "heavy metal", "death metal", "black metal", "thrash", "metalcore", "hardcore"]),
    ("dance", &["dance", "electronic", "electronica", "edm", "house", "techno", "trance", "electro", "club", "dubstep", "drum and bass", "drum & bass", "dnb", "eurodance", "disco", "deep house", "progressive house", "hardstyle", "breakbeat", "synthwave", "italo disco", "minimal"]),
    ("hiphop", &["hip hop", "hip-hop", "hiphop", "rap", "trap", "urban", "grime", "drill"]),
    ("rnb", &["r&b", "rnb", "r'n'b", "soul", "funk", "motown", "neo soul", "rhythm and blues"]),
    ("jazz", &["jazz", "smooth jazz", "swing", "bebop", "big band", "acid jazz", "jazz fusion"]),
    ("blues", &["blues", "delta blues", "blues rock"]),
    ("classical", &["classical", "classic music", "opera", "baroque", "symphony", "symphonic", "orchestra", "orchestral", "klassik", "chamber music", "piano", "early music", "contemporary classical"]),
    ("country", &["country", "bluegrass", "americana", "western", "honky tonk"]),
    ("folk", &["folk", "acoustic", "singer-songwriter", "traditional", "folklore", "bard", "volksmusik"]),
    ("latin", &["latin", "latino", "salsa", "reggaeton", "bachata", "cumbia", "merengue", "tropical", "ranchera", "regional mexican", "regional mexicana", "banda", "grupera", "norteño", "norteña", "tango", "samba", "mpb", "bossa nova", "sertanejo", "forró", "forro", "vallenato", "música latina", "musica latina", "pagode", "axé", "flamenco"]),
    ("reggae", &["reggae", "ska", "dancehall", "dub", "roots reggae", "rocksteady"]),
    ("world", &["world", "world music", "ethnic", "african", "afrobeat", "afrobeats", "arabic", "bollywood", "indian", "celtic", "balkan", "greek", "laiko", "turkish", "persian", "chanson", "french", "italian", "polish", "russian", "oriental", "asian", "hawaiian", "caribbean", "zouk", "kizomba", "highlife", "bhangra", "carnatic", "hindi", "tamil", "punjabi", "desi", "rai", "fado"]),
    ("oldies", &["oldies", "50s", "60s", "70s", "80s", "90s", "00s", "2000s", "retro", "classic hits", "golden oldies", "evergreen", "nostalgia", "old school", "throwback", "decades"]),
    ("chill", &["chill", "chillout", "chill out", "lounge", "ambient", "relax", "relaxing", "relaxation", "easy listening", "downtempo", "new age", "meditation", "lofi", "lo-fi", "smooth", "spa", "sleep", "instrumental", "soundtrack", "film music", "beautiful music"]),
    ("news", &["news", "talk", "news talk", "information", "noticias", "politics", "public radio", "npr", "bbc", "talk radio", "current affairs", "nachrichten", "informacion", "información", "debate", "local news"]),
    ("sports", &["sport", "sports", "football", "soccer", "baseball", "basketball", "hockey", "cricket", "racing", "deportes"]),
    ("religious", &["christian", "religious", "religion", "gospel", "catholic", "worship", "islam", "islamic", "quran", "koran", "church", "bible", "spiritual", "praise", "sermon", "christian music", "christian rock", "orthodox", "evangelical", "jewish", "hindu", "buddhist", "devotional", "católica", "catolica", "cristiana", "evangelio"]),
    ("kids", &["kids", "children", "children's", "kinder", "infantil", "family"]),
    ("culture", &["culture", "education", "educational", "university", "college", "student", "comedy", "entertainment", "arts", "art", "literature", "audiobook", "drama", "science", "history", "variety", "community", "community radio", "cultural", "entretenimiento"]),
];

#[derive(Debug, Clone)]
struct Entry {
    id: String,
    name: String,
    country: String,
    language: String,
    tags: String,
    /// Stream addresses, space-separated, best first.
    url: String,
    homepage: String,
    logo: String,
    genres: u32,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Count {
    pub id: String,
    pub count: usize,
}

fn genre_index(id: &str) -> Option<u32> {
    GENRES.iter().position(|g| *g == id).map(|i| i as u32)
}

/// Bit set of genres for a station's tags ("other" when nothing fits).
pub fn genres_of(tags: &str) -> u32 {
    let mut bits = 0u32;
    for tag in tags.split(',').map(|t| t.trim().to_lowercase()).filter(|t| !t.is_empty()) {
        let words: Vec<&str> = tag.split(|c: char| !(c.is_alphanumeric() || c == '&' || c == '\'')).filter(|w| !w.is_empty()).collect();
        for (genre, keys) in RULES {
            let hit = keys.iter().any(|k| {
                if tag == *k {
                    return true;
                }
                if k.contains(' ') || k.contains('-') {
                    // Multi-word key: inside the tag ("classic rock radio").
                    tag.contains(k)
                } else {
                    words.iter().any(|w| w == k)
                }
            });
            if hit {
                // "classic rock" is rock, not classical; "rock'n'roll oldies" both.
                bits |= 1 << genre_index(genre).unwrap();
            }
        }
    }
    if bits == 0 {
        bits = 1 << genre_index("other").unwrap();
    }
    bits
}

/// Genres from the tags; a station without telling tags is placed by the words
/// of its name ("Jazz FM", "Radio Rock") before it falls into "other".
pub fn genres_with_name(tags: &str, name: &str) -> u32 {
    let other = 1 << genre_index("other").unwrap();
    let bits = genres_of(tags);
    if bits != other {
        return bits;
    }
    let words: Vec<String> = name.split(|c: char| !c.is_alphanumeric() && c != '&').filter(|w| w.len() > 2).map(|w| w.to_lowercase()).collect();
    let by_name = genres_of(&words.join(","));
    if by_name != other { by_name } else { other }
}

fn load() -> Vec<Entry> {
    let mut text = String::new();
    if flate2::read::GzDecoder::new(DATA).read_to_string(&mut text).is_err() {
        return Vec::new();
    }
    text.lines()
        .filter_map(|line| {
            let f: Vec<&str> = line.split('\t').collect();
            if f.len() < 8 || f[5].is_empty() {
                return None;
            }
            Some(Entry {
                id: f[0].to_string(),
                name: f[1].trim().to_string(),
                country: f[2].to_string(),
                language: f[3].to_string(),
                tags: f[4].to_string(),
                url: f[5].to_string(),
                homepage: f[6].to_string(),
                logo: f[7].to_string(),
                genres: genres_with_name(f[4], f[1]),
            })
        })
        .filter(|e| !e.name.is_empty())
        .collect()
}

fn all() -> &'static [Entry] {
    static CATALOG: OnceLock<Vec<Entry>> = OnceLock::new();
    CATALOG.get_or_init(load)
}

fn matches(e: &Entry, country: Option<&str>, genre: Option<u32>) -> bool {
    country.is_none_or(|c| e.country.eq_ignore_ascii_case(c)) && genre.is_none_or(|g| e.genres & (1 << g) != 0)
}

pub fn station_count() -> usize {
    all().len()
}

/// Countries with stations (of a genre, if given), most stations first.
pub fn countries(genre: Option<&str>) -> Vec<Count> {
    let g = genre.and_then(genre_index);
    if genre.is_some() && g.is_none() {
        return Vec::new();
    }
    let mut map: HashMap<&str, usize> = HashMap::new();
    for e in all().iter().filter(|e| matches(e, None, g)) {
        *map.entry(e.country.as_str()).or_default() += 1;
    }
    let mut v: Vec<Count> = map.into_iter().map(|(id, count)| Count { id: id.to_string(), count }).collect();
    v.sort_by(|a, b| b.count.cmp(&a.count).then(a.id.cmp(&b.id)));
    v
}

/// Genres with stations (in a country, if given), in menu order.
pub fn genres(country: Option<&str>) -> Vec<Count> {
    let mut counts = vec![0usize; GENRES.len()];
    for e in all().iter().filter(|e| matches(e, country, None)) {
        for (i, c) in counts.iter_mut().enumerate() {
            if e.genres & (1 << i) != 0 {
                *c += 1;
            }
        }
    }
    GENRES.iter().zip(counts).filter(|(_, c)| *c > 0).map(|(g, count)| Count { id: g.to_string(), count }).collect()
}

fn describe(e: &Entry) -> String {
    let mut parts = Vec::new();
    if !e.tags.is_empty() {
        parts.push(e.tags.replace(',', ", "));
    }
    if !e.language.is_empty() {
        parts.push(e.language.clone());
    }
    if !e.homepage.is_empty() {
        parts.push(e.homepage.trim_start_matches("https://").trim_start_matches("http://").trim_end_matches('/').to_string());
    }
    parts.join(" · ")
}

fn to_station(e: &Entry) -> Station {
    let first_genre = GENRES.iter().enumerate().find(|(i, _)| e.genres & (1 << i) != 0).map(|(_, g)| *g).unwrap_or("other");
    Station {
        slug: e.id.clone(),
        name: e.name.clone(),
        genre: first_genre.to_string(),
        description: describe(e),
        page_url: e.homepage.clone(),
        stream_url: e.url.split(' ').next().map(String::from),
        streams: e.url.split(' ').filter(|u| !u.is_empty()).map(String::from).collect(),
        image: (!e.logo.is_empty()).then(|| e.logo.clone()),
    }
}

/// Stations of a country and/or genre, by name.
pub fn stations(country: Option<&str>, genre: Option<&str>) -> Vec<Station> {
    let g = genre.and_then(genre_index);
    if genre.is_some() && g.is_none() {
        return Vec::new();
    }
    let mut v: Vec<&Entry> = all().iter().filter(|e| matches(e, country, g)).collect();
    v.sort_by_cached_key(|e| e.name.to_lowercase());
    v.into_iter().map(to_station).collect()
}

pub fn station(id: &str) -> Option<Station> {
    all().iter().find(|e| e.id == id).map(to_station)
}

/// Stations whose name contains `text` (case-insensitive), at most `limit`.
pub fn search(text: &str, limit: usize) -> Vec<Station> {
    let q = text.trim().to_lowercase();
    if q.is_empty() {
        return Vec::new();
    }
    all().iter().filter(|e| e.name.to_lowercase().contains(&q)).take(limit).map(to_station).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn has(bits: u32, g: &str) -> bool {
        bits & (1 << genre_index(g).unwrap()) != 0
    }

    #[test]
    fn tags_become_genres() {
        let b = genres_of("classic rock,80s");
        assert!(has(b, "rock") && has(b, "oldies") && !has(b, "classical"));
        assert!(has(genres_of("classical,opera"), "classical"));
        assert!(has(genres_of("regional mexicana,grupera"), "latin"));
        assert!(has(genres_of("news talk"), "news"));
        assert!(has(genres_of("hip-hop"), "hiphop"));
        assert!(has(genres_of("r&b,soul"), "rnb"));
        assert!(has(genres_of("deep house"), "dance"));
        assert!(has(genres_of(""), "other"));
        assert!(has(genres_of("radio,fm"), "other"));
        // "pop" inside another word is not pop.
        assert!(!has(genres_of("popular"), "pop"));
        assert!(has(genres_with_name("", "Smooth Jazz Florida"), "jazz"));
        assert!(has(genres_with_name("", "Radio Centras"), "other"));
        assert!(!has(genres_with_name("rock", "Jazz FM"), "jazz"));
    }

    #[test]
    fn catalogue_loads_and_filters() {
        assert!(station_count() > 20_000);
        let lt = stations(Some("LT"), None);
        assert!(lt.len() > 50, "{}", lt.len());
        assert!(lt.iter().all(|s| s.stream_url.as_deref().is_some_and(|u| u.starts_with("http"))));
        // Listed twice in the archive, one station with both streams; the direct one first.
        let gold: Vec<_> = lt.iter().filter(|s| s.name == "Gold FM").collect();
        assert_eq!(gold.len(), 1);
        assert_eq!(gold[0].streams.len(), 2);
        assert!(gold[0].stream_url.as_deref().unwrap().ends_with(".mp3"));
        assert!(lt.len() < 100, "only broadcasters: {}", lt.len());
        let c = countries(None);
        assert_eq!(c[0].id, "US");
        let g = genres(Some("LT"));
        assert!(g.iter().any(|x| x.id == "pop"));
        let lt_pop = stations(Some("LT"), Some("pop"));
        assert!(!lt_pop.is_empty() && lt_pop.len() < lt.len());
        assert_eq!(countries(Some("jazz")).iter().map(|c| c.count).sum::<usize>(), stations(None, Some("jazz")).len());
        assert!(stations(None, Some("nope")).is_empty());
        let one = &lt[0];
        assert_eq!(station(&one.slug).as_ref(), Some(one));
        assert!(!search("radio", 20).is_empty());
    }
}
