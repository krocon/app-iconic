//! System fonts for `<text>` in the PNG export (prompt 012): loaded once per process – scanning
//! the font folders takes a while and the result does not change while the app runs.

use resvg::usvg::fontdb::Database;
use std::sync::{Arc, LazyLock};

static SYSTEM: LazyLock<Arc<Database>> = LazyLock::new(|| {
    let mut db = Database::new();
    db.load_system_fonts();
    Arc::new(db)
});

/// The fonts installed on this machine (shared, read-only).
pub fn system_fonts() -> Arc<Database> {
    SYSTEM.clone()
}
