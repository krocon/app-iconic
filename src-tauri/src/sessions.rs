//! The last opened/saved version of every `.icon` per path (design 002 E5): `save_icon` takes the
//! bytes of unchanged assets (and all extra files) from here, so they do not cross the bridge.

use ai_core::icon::IconFile;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};

#[derive(Default)]
pub struct IconSessions(Mutex<HashMap<String, Arc<IconFile>>>);

impl IconSessions {
    fn map(&self) -> MutexGuard<'_, HashMap<String, Arc<IconFile>>> {
        // a panic while holding the lock leaves a consistent map (only insert/remove/clone)
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn put(&self, path: &str, file: IconFile) {
        self.map().insert(path.to_owned(), Arc::new(file));
    }

    pub fn get(&self, path: &str) -> Option<Arc<IconFile>> {
        self.map().get(path).cloned()
    }

    pub fn remove(&self, path: &str) {
        self.map().remove(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ai_core::icon::new_icon;

    #[test]
    fn put_get_remove() {
        let s = IconSessions::default();
        assert!(s.get("/a.icon").is_none());
        s.put("/a.icon", new_icon());
        assert_eq!(s.get("/a.icon").unwrap().assets.len(), 1);
        s.put(
            "/a.icon",
            ai_core::icon::IconFile {
                assets: vec![],
                ..new_icon()
            },
        );
        assert!(s.get("/a.icon").unwrap().assets.is_empty());
        s.remove("/a.icon");
        assert!(s.get("/a.icon").is_none());
    }
}
