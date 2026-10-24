fn main() {
    for p in std::env::args().skip(1) {
        let r = std::panic::catch_unwind(|| wheeldesk_core::player::can_decode(&p));
        println!("{p}: {:?}", r.map_err(|_| "PANIC"));
    }
}
