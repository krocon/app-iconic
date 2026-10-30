//! The renderer of package exports (prompt 078 E1, split from `package.rs` in 079): every source
//! parsed once, every size rendered once, `cancel` checked before each rendering. Produces the
//! bytes of one planned file.

use super::containers::{ICNS_TYPES, write_icns, write_ico};
use super::package::{Content, PackageSource, invalid};
use super::png::{encode, has_transparency, parse, render};
use crate::error::{FsError, FsErrorCode};
use resvg::tiny_skia::Pixmap;
use resvg::usvg::Tree;
use resvg::usvg::fontdb::Database;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

/// PNG bytes of `pixmap` flattened onto `bg` (premultiplied over), RGB without alpha channel.
pub fn encode_opaque(pixmap: &Pixmap, bg: [u8; 3]) -> Result<Vec<u8>, FsError> {
    let mut rgb = Vec::with_capacity(pixmap.width() as usize * pixmap.height() as usize * 3);
    for p in pixmap.pixels() {
        let rest = 255 - u16::from(p.alpha());
        for (c, b) in [p.red(), p.green(), p.blue()].into_iter().zip(bg) {
            rgb.push((u16::from(c) + (u16::from(b) * rest + 127) / 255).min(255) as u8);
        }
    }
    let io = |e: png::EncodingError| FsError::new(FsErrorCode::Io, e.to_string(), None);
    let mut out = Vec::new();
    let mut enc = png::Encoder::new(&mut out, pixmap.width(), pixmap.height());
    enc.set_color(png::ColorType::Rgb);
    enc.set_depth(png::BitDepth::Eight);
    enc.write_header()
        .map_err(io)?
        .write_image_data(&rgb)
        .map_err(io)?;
    Ok(out)
}

/// Parses each source once and renders each size once.
pub(crate) struct Renderer<'a> {
    pub sources: &'a [PackageSource],
    pub fonts: Arc<Database>,
    pub cancel: &'a AtomicBool,
    pub trees: HashMap<String, Tree>,
    pub pixmaps: HashMap<(String, u32), Pixmap>,
}

/// `Ok(None)`: cancelled.
pub(crate) type Step<T> = Result<Option<T>, FsError>;

impl<'a> Renderer<'a> {
    pub fn new(sources: &'a [PackageSource], fonts: Arc<Database>, cancel: &'a AtomicBool) -> Self {
        Self {
            sources,
            fonts,
            cancel,
            trees: HashMap::new(),
            pixmaps: HashMap::new(),
        }
    }

    fn svg(&self, id: &str) -> Result<&'a str, FsError> {
        Ok(&self
            .sources
            .iter()
            .find(|s| s.id == id)
            .ok_or_else(|| invalid("source is missing"))?
            .svg)
    }

    /// Parses `id` once (also checks an SVG that is written as it is, 079 `favicon.svg`).
    fn tree(&mut self, id: &str) -> Result<&Tree, FsError> {
        if !self.trees.contains_key(id) {
            let tree = parse(self.svg(id)?, self.fonts.clone())?;
            self.trees.insert(id.to_string(), tree);
        }
        Ok(&self.trees[id])
    }

    fn pixmap(&mut self, id: &str, size: u32) -> Step<&Pixmap> {
        let key = (id.to_string(), size);
        if !self.pixmaps.contains_key(&key) {
            if self.cancel.load(Ordering::SeqCst) {
                return Ok(None);
            }
            let p = render(self.tree(id)?, size)?;
            self.pixmaps.insert(key.clone(), p);
        }
        Ok(Some(&self.pixmaps[&key]))
    }

    fn pngs(&mut self, id: &str, sizes: impl Iterator<Item = u32>) -> Step<Vec<(u32, Vec<u8>)>> {
        let mut out = Vec::new();
        for s in sizes {
            let Some(p) = self.pixmap(id, s)? else {
                return Ok(None);
            };
            out.push((s, encode(p)?));
        }
        Ok(Some(out))
    }

    /// Bytes of a file and whether the image has transparent pixels (PNG only).
    pub fn produce(&mut self, content: &Content) -> Step<(Vec<u8>, Option<bool>)> {
        Ok(Some(match content {
            Content::Text(t) => (t.as_bytes().to_vec(), None),
            Content::Svg { source } => {
                self.tree(source)?;
                (self.svg(source)?.as_bytes().to_vec(), None)
            }
            Content::Png {
                source,
                size,
                background,
            } => {
                let Some(p) = self.pixmap(source, *size)? else {
                    return Ok(None);
                };
                match background {
                    Some(bg) => (encode_opaque(p, *bg)?, Some(false)),
                    None => (encode(p)?, Some(has_transparency(p))),
                }
            }
            Content::Icns { source } => {
                let Some(pngs) = self.pngs(source, ICNS_TYPES.iter().map(|(_, s)| *s))? else {
                    return Ok(None);
                };
                let elements: Vec<(&[u8; 4], &[u8])> = ICNS_TYPES
                    .iter()
                    .zip(&pngs)
                    .map(|((ty, _), (_, d))| (*ty, d.as_slice()))
                    .collect();
                (write_icns(&elements)?, None)
            }
            Content::Ico { source, sizes } => {
                let Some(pngs) = self.pngs(source, sizes.iter().copied())? else {
                    return Ok(None);
                };
                let images: Vec<(u32, &[u8])> =
                    pngs.iter().map(|(s, d)| (*s, d.as_slice())).collect();
                (write_ico(&images)?, None)
            }
        }))
    }
}
