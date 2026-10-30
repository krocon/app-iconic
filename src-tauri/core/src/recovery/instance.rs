//! Who owns a recovery snapshot (prompt 083, design E3): every running app process is an
//! **instance** with a random id and a lock file `<recovery>/<instance>.lock` (its process id as
//! text) that it holds locked for its whole life (`File::try_lock`, `flock` / `LockFileEx`). The
//! operating system drops the lock when the process ends – also after `kill -9` or a power cut –
//! so "the lock can be taken" means "the owner is gone". Snapshot ids are `<instance>-<n>`.

use crate::error::{FsError, FsErrorCode};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

/// Hex digits of an instance id.
pub const INSTANCE_LEN: usize = 16;
/// Extension of the lock files.
pub const LOCK_EXT: &str = "lock";
/// Longest counter part of a snapshot id.
const MAX_SEQ_DIGITS: usize = 10;

/// A 16-hex-digit instance id: FNV-1a 64 of time, process id and a counter.
fn new_instance_id() -> String {
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    let seed = format!(
        "{nanos}-{}-{}",
        std::process::id(),
        SEQ.fetch_add(1, Ordering::Relaxed)
    );
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in seed.as_bytes() {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{h:016x}")
}

fn is_instance(s: &str) -> bool {
    s.len() == INSTANCE_LEN
        && s.bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

/// A snapshot id: `<16 hex>-<1..10 digits>` – nothing else ever becomes a path below the
/// recovery folder.
pub fn is_valid_id(id: &str) -> bool {
    match id.split_once('-') {
        Some((inst, n)) => {
            is_instance(inst)
                && !n.is_empty()
                && n.len() <= MAX_SEQ_DIGITS
                && n.bytes().all(|b| b.is_ascii_digit())
        }
        None => false,
    }
}

/// The instance part of a valid snapshot id.
pub fn instance_of(id: &str) -> Option<&str> {
    is_valid_id(id).then(|| &id[..INSTANCE_LEN])
}

fn lock_path(dir: &Path, instance: &str) -> PathBuf {
    dir.join(format!("{instance}.{LOCK_EXT}"))
}

/// The instance of a lock file name `<16 hex>.lock`.
pub(crate) fn lock_owner(name: &str) -> Option<&str> {
    let inst = name.strip_suffix(&format!(".{LOCK_EXT}"))?;
    is_instance(inst).then_some(inst)
}

/// Is `instance` (not this process's `own`) still running? No lock file, or a lock we can take
/// → gone. A lock we cannot take (or cannot even try) → alive: then nothing of it is touched.
pub fn alive(dir: &Path, instance: &str, own: Option<&str>) -> bool {
    if own == Some(instance) {
        return true;
    }
    let Ok(f) = fs::File::open(lock_path(dir, instance)) else {
        return false;
    };
    match f.try_lock() {
        Ok(()) => false, // the lock ends with `f`
        Err(fs::TryLockError::WouldBlock) => true,
        Err(fs::TryLockError::Error(_)) => true,
    }
}

/// This process in the recovery folder: holds its lock file locked until it is dropped.
#[derive(Debug)]
pub struct Instance {
    id: String,
    dir: PathBuf,
    lock: Mutex<Option<fs::File>>,
    seq: AtomicU64,
}

impl Instance {
    /// Creates the folder and a new lock file, locked, with the process id inside.
    pub fn acquire(dir: &Path) -> Result<Self, FsError> {
        fs::create_dir_all(dir).map_err(|e| FsError::from_io(&e, dir))?;
        let mut last = None;
        for _ in 0..8 {
            let id = new_instance_id();
            let path = lock_path(dir, &id);
            match fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)
            {
                Ok(mut f) => {
                    f.try_lock().map_err(|e| {
                        FsError::new(FsErrorCode::Io, format!("lock: {e}"), Some(&path))
                    })?;
                    let _ = f.write_all(std::process::id().to_string().as_bytes());
                    let _ = f.sync_all();
                    return Ok(Self {
                        id,
                        dir: dir.to_owned(),
                        lock: Mutex::new(Some(f)),
                        seq: AtomicU64::new(0),
                    });
                }
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => last = Some(e),
                Err(e) => return Err(FsError::from_io(&e, &path)),
            }
        }
        let e = last.unwrap_or_else(|| std::io::Error::other("no free instance id"));
        Err(FsError::from_io(&e, dir))
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// A new snapshot id of this instance.
    pub fn next_id(&self) -> String {
        format!(
            "{}-{}",
            self.id,
            self.seq.fetch_add(1, Ordering::Relaxed) + 1
        )
    }

    /// Does `id` belong to this instance?
    pub fn owns(&self, id: &str) -> bool {
        instance_of(id) == Some(self.id.as_str())
    }

    /// Regular exit (design E8): removes every snapshot of this instance, its leftovers and the
    /// lock file. Returns how many entries were removed.
    /// After it, this instance holds no lock any more (the process is about to end).
    pub fn release(&self) -> usize {
        let removed = super::remove_instance_entries(&self.dir, &self.id);
        // unlock and close first: Windows cannot delete an open file
        drop(self.lock.lock().unwrap_or_else(|e| e.into_inner()).take());
        let _ = fs::remove_file(lock_path(&self.dir, &self.id));
        removed
    }
}
