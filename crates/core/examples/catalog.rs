//! Prints how the built-in station catalogue splits into genres and countries.
fn main() {
    use wheeldesk_core::catalog;
    println!("{} stations", catalog::station_count());
    for g in catalog::genres(None) {
        println!("{:>12} {}", g.id, g.count);
    }
    for c in catalog::countries(None).iter().take(5) {
        println!("{} {}", c.id, c.count);
    }
    for g in catalog::genres(Some("LT")) {
        print!("{}={} ", g.id, g.count);
    }
    println!();
}
