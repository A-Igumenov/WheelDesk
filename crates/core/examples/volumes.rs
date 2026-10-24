//! Prints the drives the player would offer: `cargo run -p wheeldesk-core --example volumes`
fn main() {
    for v in wheeldesk_core::list_volumes() {
        println!("{:<10} {:<20} {:<30} {}", format!("{:?}", v.kind), v.label, v.mount_point, v.id);
    }
}
