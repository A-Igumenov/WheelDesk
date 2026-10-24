//! OS-independent core of WheelDesk. Everything that could behave differently on
//! Windows, macOS and Linux is hidden behind small functions in this crate, so the
//! UI and the rest of the logic see one model.

pub mod art;
pub mod open_art;
pub mod docs;
pub mod dsp;
pub mod library;
pub mod player;
pub mod playlists;
pub mod radio;
pub mod radio_catalog;
pub mod settings;
pub mod stream;
pub mod text;
pub mod volumes;

pub use library::Track;
pub use player::{Command, Player, PlayerState, QueueItem, Repeat};
pub use settings::{LibrarySource, Settings};
pub use volumes::{list_volumes, resolve_source, ResolvedSource, Volume, VolumeKind};
