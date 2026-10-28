//! Lists the computer's drives in one OS-independent shape and gives each a
//! stable id, so the remembered library drive is found again even when its
//! letter (Windows) or mount point (macOS/Linux) changes.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
#[cfg(not(windows))]
use sysinfo::Disks;

use crate::settings::LibrarySource;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VolumeKind {
    System,
    Internal,
    Removable,
    Network,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Volume {
    pub id: String,
    pub label: String,
    pub mount_point: String,
    pub kind: VolumeKind,
    pub total_bytes: u64,
    pub available_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedSource {
    pub volume: Volume,
    pub path: String,
}

const PSEUDO_FS: &[&str] = &[
    "tmpfs", "devtmpfs", "overlay", "squashfs", "proc", "sysfs", "efivarfs", "ramfs",
    "autofs", "cgroup", "cgroup2", "devfs", "nullfs", "fuse.portal", "fuse.gvfsd-fuse",
];

const NETWORK_FS: &[&str] = &[
    "nfs", "nfs4", "cifs", "smbfs", "smb2", "smb3", "afpfs", "9p", "fuse.sshfs", "sshfs", "davfs", "webdav",
];

/// Mount points that are never a music library (system internals, snaps, VM swap...).
fn is_hidden_mount(mount: &str) -> bool {
    if cfg!(target_os = "macos") {
        return mount.starts_with("/System/Volumes/") || mount.starts_with("/private/");
    }
    if cfg!(target_os = "linux") {
        if mount.starts_with("/run/media/") {
            return false;
        }
        return ["/boot", "/snap/", "/proc", "/sys", "/dev", "/run", "/var/lib/docker", "/efi"]
            .iter()
            .any(|p| mount == p.trim_end_matches('/') || mount.starts_with(p));
    }
    false
}

/// One mounted filesystem as reported by the OS, before filtering.
struct RawDisk {
    /// Device path (Linux/macOS) or volume label (Windows).
    device: String,
    mount: PathBuf,
    fs: String,
    removable: bool,
    network: bool,
    total: u64,
    available: u64,
}

/// Linux and macOS: sysinfo reads the mount table.
#[cfg(not(windows))]
fn raw_disks() -> Vec<RawDisk> {
    Disks::new_with_refreshed_list()
        .list()
        .iter()
        .map(|d| RawDisk {
            device: d.name().to_string_lossy().to_string(),
            mount: d.mount_point().to_path_buf(),
            fs: d.file_system().to_string_lossy().to_lowercase(),
            removable: d.is_removable(),
            network: false,
            total: d.total_space(),
            available: d.available_space(),
        })
        .collect()
}

/// Windows: every drive letter, including network and USB drives.
#[cfg(windows)]
fn raw_disks() -> Vec<RawDisk> {
    platform::drive_letters()
}

/// All drives a user could pick as a library, system drive first.
pub fn list_volumes() -> Vec<Volume> {
    let mut out: Vec<Volume> = Vec::new();

    for d in raw_disks() {
        let mount = d.mount.to_string_lossy().to_string();
        if PSEUDO_FS.contains(&d.fs.as_str()) || is_hidden_mount(&mount) || d.total == 0 {
            continue;
        }
        let id = platform::volume_id(&d.mount, &d.device).unwrap_or_else(|| format!("mnt:{mount}"));
        if out.iter().any(|v| v.id == id) {
            continue; // same filesystem mounted twice (bind mounts, APFS firmlinks)
        }
        let kind = if is_system_mount(&mount) {
            VolumeKind::System
        } else if d.network || NETWORK_FS.contains(&d.fs.as_str()) {
            VolumeKind::Network
        } else if d.removable {
            VolumeKind::Removable
        } else {
            VolumeKind::Internal
        };
        out.push(Volume {
            label: label_for(&d.device, &mount, kind),
            id,
            mount_point: mount,
            kind,
            total_bytes: d.total,
            available_bytes: d.available,
        });
    }

    out.sort_by_key(|v| (v.kind != VolumeKind::System, v.mount_point.to_lowercase()));
    out
}

fn is_system_mount(mount: &str) -> bool {
    if cfg!(windows) {
        let sys = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into());
        mount.trim_end_matches('\\').eq_ignore_ascii_case(sys.trim_end_matches('\\'))
    } else {
        mount == "/"
    }
}

/// Human label: the volume name where the OS has one, otherwise something readable.
fn label_for(device: &str, mount: &str, kind: VolumeKind) -> String {
    let looks_like_device = device.is_empty() || device.starts_with("/dev/") || device.contains(':');
    if cfg!(windows) {
        let letter = mount.trim_end_matches('\\');
        return if device.is_empty() { format!("Local Disk ({letter})") } else { format!("{device} ({letter})") };
    }
    if !looks_like_device {
        return device.to_string();
    }
    if kind == VolumeKind::System {
        return "System".into();
    }
    Path::new(mount)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| mount.to_string())
}

/// Finds the remembered library on the drives that are present right now.
pub fn resolve_source(source: &LibrarySource, volumes: &[Volume]) -> Option<ResolvedSource> {
    let volume = volumes.iter().find(|v| v.id == source.volume_id)?.clone();
    let mut path = PathBuf::from(&volume.mount_point);
    for part in source.relative_path.split(['/', '\\']).filter(|p| !p.is_empty() && *p != "." && *p != "..") {
        path.push(part);
    }
    Some(ResolvedSource { path: path.to_string_lossy().to_string(), volume })
}

// ------------------------------------------------------------------ per-OS ids

#[cfg(target_os = "linux")]
mod platform {
    use std::fs;
    use std::path::Path;

    /// Filesystem UUID from /dev/disk/by-uuid, matched against the block device.
    pub fn volume_id(_mount: &Path, device: &str) -> Option<String> {
        let dev = fs::canonicalize(device).ok()?;
        for entry in fs::read_dir("/dev/disk/by-uuid").ok()?.flatten() {
            if fs::canonicalize(entry.path()).ok().as_deref() == Some(dev.as_path()) {
                return Some(format!("uuid:{}", entry.file_name().to_string_lossy()));
            }
        }
        None
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use std::path::Path;
    use std::process::Command;

    /// VolumeUUID reported by `diskutil info -plist <mount>`.
    pub fn volume_id(mount: &Path, _device: &str) -> Option<String> {
        let out = Command::new("/usr/sbin/diskutil").arg("info").arg("-plist").arg(mount).output().ok()?;
        if !out.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&out.stdout);
        let key = text.find("<key>VolumeUUID</key>")?;
        let rest = &text[key..];
        let start = rest.find("<string>")? + "<string>".len();
        let end = rest[start..].find("</string>")? + start;
        let uuid = rest[start..end].trim();
        (!uuid.is_empty()).then(|| format!("uuid:{uuid}"))
    }
}

#[cfg(windows)]
mod platform {
    use std::os::windows::ffi::OsStrExt;
    use std::path::{Path, PathBuf};

    use windows_sys::Win32::Storage::FileSystem::{
        GetDiskFreeSpaceExW, GetDriveTypeW, GetLogicalDrives, GetVolumeInformationW,
        GetVolumeNameForVolumeMountPointW,
    };

    use super::RawDisk;

    const DRIVE_REMOVABLE: u32 = 2;
    const DRIVE_FIXED: u32 = 3;
    const DRIVE_REMOTE: u32 = 4;
    const DRIVE_CDROM: u32 = 5;
    const DRIVE_RAMDISK: u32 = 6;

    fn wide_dir(mount: &Path) -> Vec<u16> {
        let mut w: Vec<u16> = mount.as_os_str().encode_wide().collect();
        if w.last() != Some(&(b'\\' as u16)) {
            w.push(b'\\' as u16);
        }
        w.push(0);
        w
    }

    fn from_wide(buf: &[u16]) -> String {
        let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        String::from_utf16_lossy(&buf[..len])
    }

    /// Every lettered drive with media in it. Drives without media (empty card
    /// reader, empty DVD) report no size and are skipped by the caller.
    pub fn drive_letters() -> Vec<RawDisk> {
        // SAFETY: plain call without arguments.
        let mask = unsafe { GetLogicalDrives() };
        let mut out = Vec::new();
        for i in 0..26u32 {
            if mask & (1 << i) == 0 {
                continue;
            }
            let letter = (b'A' + i as u8) as char;
            let mount = PathBuf::from(format!("{letter}:\\"));
            let root = wide_dir(&mount);
            // SAFETY: `root` is NUL-terminated.
            let kind = unsafe { GetDriveTypeW(root.as_ptr()) };
            if !matches!(kind, DRIVE_REMOVABLE | DRIVE_FIXED | DRIVE_REMOTE | DRIVE_CDROM | DRIVE_RAMDISK) {
                continue;
            }

            let (mut avail, mut total, mut free) = (0u64, 0u64, 0u64);
            // SAFETY: `root` is NUL-terminated; the out-pointers are valid u64s.
            let ok = unsafe { GetDiskFreeSpaceExW(root.as_ptr(), &mut avail, &mut total, &mut free) };
            if ok == 0 {
                continue;
            }

            let mut label = [0u16; 261];
            let mut fs_name = [0u16; 261];
            // SAFETY: buffers are writable and their lengths are passed; null out-pointers are allowed.
            let has_info = unsafe {
                GetVolumeInformationW(
                    root.as_ptr(),
                    label.as_mut_ptr(),
                    label.len() as u32,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    fs_name.as_mut_ptr(),
                    fs_name.len() as u32,
                )
            } != 0;

            out.push(RawDisk {
                device: if has_info { from_wide(&label) } else { String::new() },
                mount,
                fs: if has_info { from_wide(&fs_name).to_lowercase() } else { String::new() },
                removable: matches!(kind, DRIVE_REMOVABLE | DRIVE_CDROM),
                network: kind == DRIVE_REMOTE,
                total,
                available: avail,
            });
        }
        out
    }

    /// Volume GUID (`\\?\Volume{...}\`): stable when the drive letter changes.
    pub fn volume_id(mount: &Path, _device: &str) -> Option<String> {
        let path = wide_dir(mount);
        let mut buf = [0u16; 64];
        // SAFETY: `path` is NUL-terminated and `buf` is a writable buffer of the given length.
        let ok = unsafe { GetVolumeNameForVolumeMountPointW(path.as_ptr(), buf.as_mut_ptr(), buf.len() as u32) };
        if ok == 0 {
            return None;
        }
        let name = from_wide(&buf);
        let guid = name.split('{').nth(1)?.split('}').next()?;
        Some(format!("guid:{}", guid.to_lowercase()))
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
mod platform {
    use std::path::Path;
    pub fn volume_id(_mount: &Path, _device: &str) -> Option<String> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vol(id: &str, mount: &str) -> Volume {
        Volume {
            id: id.into(),
            label: "X".into(),
            mount_point: mount.into(),
            kind: VolumeKind::Removable,
            total_bytes: 1,
            available_bytes: 1,
        }
    }

    #[test]
    fn finds_library_after_mount_point_changed() {
        let src = LibrarySource { volume_id: "uuid:abc".into(), relative_path: "Music/Albums".into() };
        // Same drive, now mounted somewhere else.
        let vols = [vol("uuid:zzz", "/media/a"), vol("uuid:abc", "/media/new")];
        let r = resolve_source(&src, &vols).unwrap();
        assert_eq!(r.volume.id, "uuid:abc");
        assert_eq!(PathBuf::from(&r.path), PathBuf::from("/media/new").join("Music").join("Albums"));
    }

    #[test]
    fn missing_drive_gives_none() {
        let src = LibrarySource { volume_id: "uuid:gone".into(), relative_path: String::new() };
        assert!(resolve_source(&src, &[vol("uuid:abc", "/")]).is_none());
    }

    #[test]
    fn relative_path_cannot_escape_the_volume() {
        let src = LibrarySource { volume_id: "a".into(), relative_path: "../../etc\\..\\x".into() };
        let r = resolve_source(&src, &[vol("a", "/mnt/usb")]).unwrap();
        assert_eq!(PathBuf::from(&r.path), PathBuf::from("/mnt/usb").join("etc").join("x"));
    }

    #[test]
    fn lists_the_system_drive_first() {
        let vols = list_volumes();
        assert!(!vols.is_empty(), "no volumes found");
        assert_eq!(vols[0].kind, VolumeKind::System);
        assert!(vols.iter().all(|v| !v.id.is_empty()));
    }
}
