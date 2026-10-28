//! Thin Tauri shell: exposes core functions to the UI as commands and forwards
//! player and scan progress as events. No OS-specific logic lives here; that
//! belongs in `wheeldesk-core`.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State};
use wheeldesk_core::catalog;
use wheeldesk_core::docs::{self, FileListing};
use wheeldesk_core::playlists::{self, DirListing, Playlist};
use wheeldesk_core::radio::{self, Station};
use wheeldesk_core::{
    art, library, list_volumes as core_list_volumes, resolve_source, settings, Command, LibrarySource, Player,
    QueueItem, Repeat, ResolvedSource, Settings, Track, Volume,
};

struct AppState {
    config_dir: PathBuf,
    cache_dir: PathBuf,
    settings: Mutex<Settings>,
    player: Player,
    /// The tray icon was created (minimize hides to it; otherwise a normal minimize).
    tray: AtomicBool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanProgress {
    root: String,
    done: usize,
    total: usize,
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> Settings {
    state.settings.lock().expect("settings lock").clone()
}

#[tauri::command]
fn save_settings(state: State<AppState>, settings: Settings) -> Result<(), String> {
    settings.save(&state.config_dir).map_err(|e| e.to_string())?;
    *state.settings.lock().expect("settings lock") = settings;
    Ok(())
}

#[tauri::command]
async fn list_volumes() -> Vec<Volume> {
    // Volume probing can touch slow network/USB drives: keep it off the UI thread.
    tauri::async_runtime::spawn_blocking(core_list_volumes).await.unwrap_or_default()
}

/// Finds a library source on the drives present now. Uses `source` when given,
/// otherwise the remembered one.
#[tauri::command]
async fn resolve_library_source(
    state: State<'_, AppState>,
    source: Option<LibrarySource>,
) -> Result<Option<ResolvedSource>, String> {
    let source = match source {
        Some(s) => s,
        None => match state.settings.lock().expect("settings lock").library_source.clone() {
            Some(s) => s,
            None => return Ok(None),
        },
    };
    let volumes = tauri::async_runtime::spawn_blocking(core_list_volumes)
        .await
        .map_err(|e| e.to_string())?;
    Ok(resolve_source(&source, &volumes))
}

#[tauri::command]
async fn list_dirs(path: String) -> Vec<String> {
    tauri::async_runtime::spawn_blocking(move || library::list_subdirs(Path::new(&path)))
        .await
        .unwrap_or_default()
}

/// Sub-folders and playlist files of a folder (Import from PC browser).
#[tauri::command]
async fn list_playlist_dir(path: String) -> DirListing {
    tauri::async_runtime::spawn_blocking(move || playlists::list_dir(Path::new(&path)))
        .await
        .unwrap_or(DirListing { dirs: vec![], playlists: vec![] })
}

/// Sub-folders and files with the given extensions (Notes, Calendars).
#[tauri::command]
async fn list_files(path: String, exts: Vec<String>) -> FileListing {
    tauri::async_runtime::spawn_blocking(move || docs::list_files(Path::new(&path), &exts))
        .await
        .unwrap_or(FileListing { dirs: vec![], files: vec![] })
}

/// Photos under a folder, all levels (Photos).
#[tauri::command]
async fn find_files(path: String, exts: Vec<String>) -> Vec<String> {
    tauri::async_runtime::spawn_blocking(move || docs::find_files(Path::new(&path), &exts, 20_000))
        .await
        .unwrap_or_default()
}

/// World station catalogue: countries (optionally of one genre), most stations first.
#[tauri::command]
async fn radio_countries(genre: Option<String>) -> Vec<catalog::Count> {
    tauri::async_runtime::spawn_blocking(move || catalog::countries(genre.as_deref())).await.unwrap_or_default()
}

/// World station catalogue: genres (optionally in one country).
#[tauri::command]
async fn radio_genres(country: Option<String>) -> Vec<catalog::Count> {
    tauri::async_runtime::spawn_blocking(move || catalog::genres(country.as_deref())).await.unwrap_or_default()
}

/// Stations of a country and/or genre, by name.
#[tauri::command]
async fn radio_catalog(country: Option<String>, genre: Option<String>) -> Vec<Station> {
    tauri::async_runtime::spawn_blocking(move || catalog::stations(country.as_deref(), genre.as_deref()))
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn radio_station(id: String) -> Option<Station> {
    tauri::async_runtime::spawn_blocking(move || catalog::station(&id)).await.ok().flatten()
}

/// A note or calendar file as text.
#[tauri::command]
async fn read_text(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || docs::read_text(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}

/// Reads a playlist file now (so changes made to it on the PC show up).
#[tauri::command]
async fn read_playlist(path: String) -> Result<Playlist, String> {
    tauri::async_runtime::spawn_blocking(move || playlists::read(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}

/// Tracks from the previous scan, for an instant start.
#[tauri::command]
async fn library_cached(state: State<'_, AppState>, root: String) -> Result<Vec<Track>, String> {
    let cache = state.cache_dir.clone();
    tauri::async_runtime::spawn_blocking(move || library::cached(Path::new(&root), &cache))
        .await
        .map_err(|e| e.to_string())
}

/// Full scan of `root`; progress arrives as "scan-progress" events.
#[tauri::command]
async fn scan_library(app: AppHandle, state: State<'_, AppState>, root: String) -> Result<Vec<Track>, String> {
    let cache = state.cache_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let r = root.clone();
        library::scan(Path::new(&root), Some(&cache), &|done, total| {
            let _ = app.emit("scan-progress", ScanProgress { root: r.clone(), done, total });
        })
    })
    .await
    .map_err(|e| e.to_string())
}

/// Album art as a data URL: embedded, folder image, then online (if allowed).
#[tauri::command]
async fn get_art(
    state: State<'_, AppState>,
    path: String,
    artist: String,
    album: String,
    online: bool,
) -> Result<Option<String>, String> {
    let cache = state.cache_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        art::local(Path::new(&path))
            .or_else(|| if online { art::online(&artist, &album, &cache) } else { None })
            .map(|a| a.data_url())
    })
    .await
    .map_err(|e| e.to_string())
}

/// Radio stations from fm.lt (built-in list if the site cannot be reached).
#[tauri::command]
async fn radio_stations() -> Vec<Station> {
    tauri::async_runtime::spawn_blocking(radio::fetch_list).await.unwrap_or_else(|_| radio::seed())
}

/// Description, picture and stream address for one station.
#[tauri::command]
async fn radio_resolve(state: State<'_, AppState>, station: Station, fresh: bool) -> Result<Station, String> {
    let cache = state.cache_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if fresh {
            radio::forget(&station.slug, &cache);
        }
        radio::resolve(station, &cache)
    })
    .await
    .map_err(|e| e.to_string())
}

/// Cover image URL for the song a station is playing (open music database first).
#[tauri::command]
async fn song_cover(state: State<'_, AppState>, artist: String, title: String) -> Result<Option<String>, String> {
    let cache = state.cache_dir.clone();
    tauri::async_runtime::spawn_blocking(move || radio::song_cover(&artist, &title, &cache))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn player_load(state: State<AppState>, queue: Vec<QueueItem>, index: usize, play: bool) {
    state.player.send(Command::Load { queue, index, play });
}

/// Small transport commands: "toggle", "pause", "next", "prev", "stop",
/// "seekTo" (ms), "seekBy" (ms), "volume" (0–1), "repeat" ("off"/"one"/"all").
#[tauri::command]
fn player_cmd(state: State<AppState>, cmd: String, value: Option<f64>, text: Option<String>) -> Result<(), String> {
    let c = match cmd.as_str() {
        "toggle" => Command::PlayPause,
        "pause" => Command::Pause,
        "next" => Command::Next,
        "prev" => Command::Prev,
        "stop" => Command::Stop,
        "seekTo" => Command::SeekTo(value.unwrap_or(0.0).max(0.0) as u64),
        "seekBy" => Command::SeekBy(value.unwrap_or(0.0) as i64),
        "volume" => Command::Volume(value.unwrap_or(0.7) as f32),
        "repeat" => Command::SetRepeat(match text.as_deref() {
            Some("one") => Repeat::One,
            Some("all") => Repeat::All,
            _ => Repeat::Off,
        }),
        "eq" => {
            let mut g = [0f32; 10];
            for (slot, v) in g.iter_mut().zip(text.as_deref().unwrap_or("").split(',')) {
                *slot = v.trim().parse().unwrap_or(0.0);
            }
            Command::SetEq(g)
        }
        "soundcheck" => Command::SoundCheck(value.unwrap_or(0.0) != 0.0),
        "crossfade" => Command::Crossfade(value.unwrap_or(0.0) != 0.0),
        other => return Err(format!("unknown player command: {other}")),
    };
    state.player.send(c);
    Ok(())
}

/// Minimize button: hide the window to the tray next to the clock. False when
/// there is no tray on this desktop (the UI then minimizes normally).
#[tauri::command]
fn hide_to_tray(app: AppHandle, state: State<AppState>) -> bool {
    if !state.tray.load(Ordering::Relaxed) {
        return false;
    }
    match app.get_webview_window("main") {
        Some(w) => w.hide().is_ok(),
        None => false,
    }
}

/// Brings the player back from the tray (an alarm went off).
#[tauri::command]
fn show_window(app: AppHandle) {
    show_main(&app);
}

/// Close button: quits the whole program (music stops, tray icon goes away).
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn toggle_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false) {
            let _ = w.hide();
        } else {
            show_main(app);
        }
    }
}

/// Tray icon next to the clock: click shows/hides the player; the menu also
/// controls playback and quits.
fn build_tray(app: &tauri::App, lang: &str) -> tauri::Result<()> {
    let (show, play, next, prev, quit) = match lang {
        "lt" => ("Rodyti WheelDesk", "Groti / pauzė", "Kita daina", "Ankstesnė daina", "Išeiti"),
        "ru" => ("Показать WheelDesk", "Играть / пауза", "Следующая", "Предыдущая", "Выход"),
        _ => ("Show WheelDesk", "Play / Pause", "Next", "Previous", "Quit"),
    };
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "show", show, true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "play", play, true, None::<&str>)?,
            &MenuItem::with_id(app, "next", next, true, None::<&str>)?,
            &MenuItem::with_id(app, "prev", prev, true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", quit, true, None::<&str>)?,
        ],
    )?;
    let mut b = TrayIconBuilder::with_id("main")
        .tooltip("WheelDesk")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "show" => show_main(app),
            "play" => app.state::<AppState>().player.send(Command::PlayPause),
            "next" => app.state::<AppState>().player.send(Command::Next),
            "prev" => app.state::<AppState>().player.send(Command::Prev),
            "quit" => {
                // Let the UI save where the music is; quit anyway if it does not answer.
                let _ = app.emit("app-quit", ());
                let handle = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(1500));
                    handle.exit(0);
                });
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                toggle_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        b = b.icon(icon.clone());
    }
    b.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config_dir = settings::config_dir().unwrap_or_else(|| PathBuf::from("."));
    let cache_dir = settings::cache_dir().unwrap_or_else(|| config_dir.join("cache"));
    let loaded = Settings::load(&config_dir);
    let lang = loaded.language.clone();

    tauri::Builder::default()
        .setup(move |app| {
            let handle = app.handle().clone();
            let player = Player::spawn(move |s| {
                let _ = handle.emit("player-state", s);
            });
            std::thread::spawn(catalog::station_count);
            let tray = match build_tray(app, &lang) {
                Ok(()) => true,
                Err(e) => {
                    eprintln!("tray icon unavailable: {e}");
                    false
                }
            };
            app.manage(AppState { config_dir, cache_dir, settings: Mutex::new(loaded), player, tray: AtomicBool::new(tray) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            list_volumes,
            resolve_library_source,
            list_dirs,
            list_playlist_dir,
            read_playlist,
            library_cached,
            scan_library,
            get_art,
            radio_stations,
            radio_resolve,
            song_cover,
            player_load,
            player_cmd,
            list_files,
            find_files,
            read_text,
            radio_countries,
            radio_genres,
            radio_catalog,
            radio_station,
            hide_to_tray,
            show_window,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running WheelDesk");
}
