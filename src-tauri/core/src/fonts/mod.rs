//! Fonts (prompts 012, 013): the system font database once per process ([`system`]), the list of
//! families and styles the frontend shows, and text to path ([`outline`]).
//!
//! - [`system`]   fontdb with the system fonts, generic families mapped to installed fonts (012)
//! - [`outline`]  one line of text → SVG path data: shaping with harfrust, outlines with skrifa
//!
//! A font is named by an id that stays the same between sessions (design 013 E10): its PostScript
//! name, else `<family>-<style>`; a second face with the same id but another family or style gets
//! `#2`, `#3` … (a second copy of the same font is left out).

pub mod outline;
pub mod system;

use resvg::usvg::fontdb::{self, Database, Language};
use serde::Serialize;
use skrifa::{MetadataProvider, string::StringId};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock};

/// One style of a family, e.g. "Bold Italic".
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontStyle {
    pub name: String,
    pub weight: u16,
    pub italic: bool,
    pub id: String,
}

/// A font family with its styles (sorted by weight, upright before italic).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontFamily {
    pub family: String,
    pub styles: Vec<FontStyle>,
}

/// The families of a database and the face behind every id.
#[derive(Debug, Default)]
pub struct FontCatalog {
    pub families: Vec<FontFamily>,
    ids: HashMap<String, fontdb::ID>,
}

impl FontCatalog {
    /// The face of `id`, if the catalog has it.
    pub fn face(&self, id: &str) -> Option<fontdb::ID> {
        self.ids.get(id).copied()
    }

    /// Lists every face of `db` (hidden macOS system fonts, whose names start with `.`, left out).
    pub fn build(db: &Database) -> Self {
        let mut ids: HashMap<String, fontdb::ID> = HashMap::new();
        let mut seen: HashMap<String, (String, String)> = HashMap::new();
        let mut by_family: HashMap<String, Vec<FontStyle>> = HashMap::new();
        for face in db.faces() {
            let Some(family) = family_name(face) else {
                continue;
            };
            if family.starts_with('.') || family.trim().is_empty() {
                continue;
            }
            let italic = face.style != fontdb::Style::Normal;
            let name = style_name(db, face).unwrap_or_else(|| derived_style(face.weight.0, italic));
            let base = if face.post_script_name.trim().is_empty() {
                format!("{family}-{name}").replace(' ', "")
            } else {
                face.post_script_name.clone()
            };
            if let Some((f, s)) = seen.get(&base)
                && f == &family
                && s == &name
            {
                continue; // the same font installed twice
            }
            let mut id = base.clone();
            let mut n = 2;
            while ids.contains_key(&id) {
                id = format!("{base}#{n}");
                n += 1;
            }
            seen.entry(base).or_insert((family.clone(), name.clone()));
            ids.insert(id.clone(), face.id);
            by_family.entry(family).or_default().push(FontStyle {
                name,
                weight: face.weight.0,
                italic,
                id,
            });
        }
        let mut families: Vec<FontFamily> = by_family
            .into_iter()
            .map(|(family, mut styles)| {
                styles.sort_by(|a, b| {
                    (a.weight, a.italic, &a.name).cmp(&(b.weight, b.italic, &b.name))
                });
                FontFamily { family, styles }
            })
            .collect();
        families.sort_by(|a, b| {
            a.family
                .to_lowercase()
                .cmp(&b.family.to_lowercase())
                .then(a.family.cmp(&b.family))
        });
        Self { families, ids }
    }
}

/// The English family name, else the first one.
fn family_name(face: &fontdb::FaceInfo) -> Option<String> {
    face.families
        .iter()
        .find(|(_, l)| *l == Language::English_UnitedStates)
        .or_else(|| face.families.first())
        .map(|(n, _)| n.clone())
}

/// Style name from the `name` table: typographic subfamily (17), else subfamily (2).
fn style_name(db: &Database, face: &fontdb::FaceInfo) -> Option<String> {
    db.with_face_data(face.id, |data, index| {
        let font = skrifa::FontRef::from_index(data, index).ok()?;
        [
            StringId::TYPOGRAPHIC_SUBFAMILY_NAME,
            StringId::SUBFAMILY_NAME,
        ]
        .into_iter()
        .find_map(|sid| {
            let s = font.localized_strings(sid).english_or_first()?.to_string();
            let s = s.trim().to_string();
            (!s.is_empty()).then_some(s)
        })
    })
    .flatten()
}

/// "Bold Italic" from the numbers when the font names no style.
fn derived_style(weight: u16, italic: bool) -> String {
    let w = match weight {
        0..=149 => "Thin",
        150..=249 => "ExtraLight",
        250..=349 => "Light",
        350..=449 => "Regular",
        450..=549 => "Medium",
        550..=649 => "SemiBold",
        650..=749 => "Bold",
        750..=849 => "ExtraBold",
        _ => "Black",
    };
    match (w, italic) {
        ("Regular", true) => "Italic".into(),
        (w, true) => format!("{w} Italic"),
        (w, false) => w.into(),
    }
}

static SYSTEM_CATALOG: LazyLock<Arc<FontCatalog>> =
    LazyLock::new(|| Arc::new(FontCatalog::build(&system::system_fonts())));

/// The catalog of the system fonts, built once per process.
pub fn system_catalog() -> Arc<FontCatalog> {
    SYSTEM_CATALOG.clone()
}

#[cfg(test)]
pub(crate) mod test_font {
    use super::*;
    use std::path::PathBuf;

    pub fn path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../testdata/fonts/Caladea-Regular.ttf")
    }

    /// A database with only the OFL test font (testdata/fonts).
    pub fn db() -> Database {
        let mut db = Database::new();
        db.load_font_file(path()).expect("test font");
        db
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_test_font_is_listed_with_family_style_and_id() {
        let db = test_font::db();
        let cat = FontCatalog::build(&db);
        assert_eq!(
            cat.families,
            vec![FontFamily {
                family: "Caladea".into(),
                styles: vec![FontStyle {
                    name: "Regular".into(),
                    weight: 400,
                    italic: false,
                    id: "Caladea-Regular".into(),
                }],
            }]
        );
        assert!(cat.face("Caladea-Regular").is_some());
        assert!(cat.face("Nope").is_none());
    }

    #[test]
    fn the_same_font_twice_is_listed_once() {
        let mut db = test_font::db();
        db.load_font_file(test_font::path()).unwrap();
        assert_eq!(db.len(), 2);
        let cat = FontCatalog::build(&db);
        assert_eq!(cat.families[0].styles.len(), 1);
    }

    #[test]
    fn a_colliding_id_of_another_face_gets_a_number() {
        let mut db = test_font::db();
        db.load_font_file(test_font::path()).unwrap();
        // the second copy pretends to be another family with the same PostScript name
        let second = db.faces().nth(1).unwrap().id;
        let mut info = db.face(second).unwrap().clone();
        db.remove_face(second);
        info.families = vec![("Other".into(), Language::English_UnitedStates)];
        db.push_face_info(info);
        let cat = FontCatalog::build(&db);
        let ids: Vec<_> = cat
            .families
            .iter()
            .flat_map(|f| f.styles.iter().map(|s| s.id.clone()))
            .collect();
        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&"Caladea-Regular".to_string()));
        assert!(ids.contains(&"Caladea-Regular#2".to_string()));
    }

    #[test]
    fn styles_without_a_name_are_derived() {
        assert_eq!(derived_style(400, false), "Regular");
        assert_eq!(derived_style(400, true), "Italic");
        assert_eq!(derived_style(700, true), "Bold Italic");
        assert_eq!(derived_style(100, false), "Thin");
        assert_eq!(derived_style(900, false), "Black");
    }

    #[test]
    fn the_system_catalog_has_no_hidden_families() {
        let cat = system_catalog();
        assert!(cat.families.iter().all(|f| !f.family.starts_with('.')));
        for f in &cat.families {
            for s in &f.styles {
                assert!(cat.face(&s.id).is_some(), "{}", s.id);
            }
        }
    }
}
