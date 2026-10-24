//! Optional live smoke check; unit tests use deterministic API fixtures.
fn main() {
    let args: Vec<_> = std::env::args().collect();
    let artist = args.get(1).map(String::as_str).unwrap_or("The Beatles");
    let title = args.get(2).map(String::as_str).unwrap_or("Come Together");
    let result = wheeldesk_core::open_art::lookup(artist, title, &std::env::temp_dir().join("wheeldesk-open-art-smoke"));
    println!("{}", serde_json::to_string_pretty(&result).unwrap());
}
