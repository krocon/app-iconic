//! System fonts for `<text>` in the PNG export (prompt 012): loaded once per process – scanning
//! the font folders takes a while and the result does not change while the app runs.
//!
//! fontdb maps the generic families to fixed names (`sans-serif` → Arial, `serif` → Times New
//! Roman …). Linux often has neither, and text in those families would vanish, so each generic
//! family gets the first installed font of a list (else any installed font).

use resvg::usvg::fontdb::Database;
use std::sync::{Arc, LazyLock};

const SANS: &[&str] = &[
    "Arial",
    "Helvetica",
    "Helvetica Neue",
    "Segoe UI",
    "Liberation Sans",
    "DejaVu Sans",
    "Noto Sans",
    "Cantarell",
    "Ubuntu",
];
const SERIF: &[&str] = &[
    "Times New Roman",
    "Times",
    "Liberation Serif",
    "DejaVu Serif",
    "Noto Serif",
];
const MONO: &[&str] = &[
    "Courier New",
    "Menlo",
    "Consolas",
    "Liberation Mono",
    "DejaVu Sans Mono",
    "Noto Sans Mono",
    "Ubuntu Mono",
];

fn first_installed(db: &Database, names: &[&str]) -> Option<String> {
    names
        .iter()
        .find(|n| {
            db.faces().any(|f| {
                f.families
                    .iter()
                    .any(|(fam, _)| fam.eq_ignore_ascii_case(n))
            })
        })
        .map(|n| n.to_string())
}

/// Points the generic families of `db` at installed fonts (see module docs).
pub fn map_generic_families(db: &mut Database) {
    let any = db
        .faces()
        .next()
        .and_then(|f| f.families.first().map(|(n, _)| n.clone()));
    let Some(any) = any else { return };
    let sans = first_installed(db, SANS).unwrap_or_else(|| any.clone());
    let serif = first_installed(db, SERIF).unwrap_or_else(|| sans.clone());
    let mono = first_installed(db, MONO).unwrap_or_else(|| sans.clone());
    db.set_sans_serif_family(sans.clone());
    db.set_serif_family(serif);
    db.set_monospace_family(mono);
    db.set_cursive_family(sans.clone());
    db.set_fantasy_family(sans);
}

static SYSTEM: LazyLock<Arc<Database>> = LazyLock::new(|| {
    let mut db = Database::new();
    db.load_system_fonts();
    map_generic_families(&mut db);
    Arc::new(db)
});

/// The fonts installed on this machine (shared, read-only).
pub fn system_fonts() -> Arc<Database> {
    SYSTEM.clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    use resvg::usvg::fontdb::{Family, Query};

    #[test]
    fn generic_families_resolve_when_fonts_are_installed() {
        let db = system_fonts();
        if db.is_empty() {
            return;
        }
        for family in [Family::SansSerif, Family::Serif, Family::Monospace] {
            let q = Query {
                families: &[family],
                ..Query::default()
            };
            assert!(db.query(&q).is_some(), "{family:?} has no font");
        }
    }

    /// Like a Linux machine without Arial/Times (the CI runner): one DejaVu font only.
    #[test]
    fn generic_families_fall_back_to_what_is_installed() {
        let file = std::path::Path::new("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf");
        if !file.exists() {
            return;
        }
        let mut db = Database::new();
        db.load_font_file(file).unwrap();
        map_generic_families(&mut db);
        for family in [
            Family::SansSerif,
            Family::Serif,
            Family::Monospace,
            Family::Cursive,
        ] {
            assert_eq!(db.family_name(&family), "DejaVu Sans");
        }
        let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><text x="100" y="700" font-family="sans-serif" font-size="600">X</text><text x="600" y="700" font-size="600">Y</text></svg>"##;
        let p = crate::export::png::render_png(svg, 64, Arc::new(db)).unwrap();
        let left = (0..64).flat_map(|y| (0..32).map(move |x| (x, y)));
        let right = (0..64).flat_map(|y| (32..64).map(move |x| (x, y)));
        let inked = |pts: &mut dyn Iterator<Item = (u32, u32)>| {
            pts.filter(|&(x, y)| p.pixel(x, y).unwrap().alpha() > 0)
                .count()
        };
        assert!(inked(&mut left.into_iter()) > 20, "sans-serif text missing");
        assert!(
            inked(&mut right.into_iter()) > 20,
            "text without font-family missing"
        );
    }

    #[test]
    fn an_empty_database_stays_empty() {
        let mut db = Database::new();
        map_generic_families(&mut db);
        assert!(db.is_empty());
    }
}
