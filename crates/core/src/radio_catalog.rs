//! Bundled M3U metadata shared with the browser demo. No network lookup on load.
use crate::radio::Station;
use serde::Deserialize;

type Row = (String, String, String, String, String, String, String, String);
#[derive(Deserialize)]
struct Catalog { stations: Vec<Row> }

pub fn stations() -> Vec<Station> {
    let catalog: Catalog = serde_json::from_str(include_str!("../../../assets/radio-stations.json"))
        .expect("bundled radio catalogue must be valid");
    catalog.stations.into_iter().map(|(slug, name, country, country_code, url, genre, page_url, image)| Station {
        slug, name, country, country_code, genre, description: String::new(), page_url,
        stream_url: Some(url), image: (!image.is_empty()).then_some(image),
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn bundled_m3u_is_complete_and_has_unique_playable_entries() {
        let list = stations();
        assert_eq!(list.len(), 33936);
        assert_eq!(list.iter().map(|s| &s.country).collect::<HashSet<_>>().len(), 218);
        assert_eq!(list.iter().map(|s| &s.slug).collect::<HashSet<_>>().len(), list.len());
        assert_eq!(list.iter().filter(|s| s.country_code == "LT").count(), 50);
        assert!(list.iter().all(|s| !s.name.is_empty() && !s.country.is_empty()
            && s.stream_url.as_ref().is_some_and(|u| u.starts_with("http://") || u.starts_with("https://"))));
        assert!(list.iter().all(|s| s.image.as_deref() != Some("null")));
    }

    #[test]
    fn explicit_stream_is_not_replaced_by_legacy_cache_or_website_lookup() {
        let station = stations().into_iter().find(|s| s.name == "LRT Opus").unwrap();
        // This path is not created: resolve must return without touching disk/network.
        let resolved = crate::radio::resolve(station.clone(), std::path::Path::new("unused-catalog-cache"));
        assert_eq!(resolved, station);
    }

    #[test]
    fn xspf_stream_lists_are_unwrapped_and_never_treated_as_audio() {
        let xml = r#"<?xml version="1.0"?><playlist><trackList>
          <track><location>file:///ignore.mp3</location></track>
          <track><location>https://example.test/live?a=1&amp;b=2</location></track>
        </trackList></playlist>"#;
        assert_eq!(crate::stream::first_url_in_playlist(xml).as_deref(), Some("https://example.test/live?a=1&b=2"));
        assert!(crate::stream::first_url_in_playlist("<playlist><trackList/></playlist>").is_none());
    }
}
