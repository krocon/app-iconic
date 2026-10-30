//! The cleaner of a symbol SVG (prompt 084, design E6): every SVG of the own library – saved from
//! the WebView, loaded from `<app config>/symbols/`, imported from a folder – goes through
//! [`parse`] and is written anew by [`write`]. It is a **whitelist**: only `<svg>`, `<g>` and the
//! basic shapes survive, only geometry and paint attributes whose characters cannot form a script,
//! an event handler or a reference (`url(`, `href`, `javascript:`, CSS escapes …); everything else
//! (scripts, `<style>`, `<foreignObject>`, `<image>`, `<use>`, text, gradients, filters, entities,
//! DTDs) is dropped. Limits: bytes, nodes, depth, attribute lengths. The XML is parsed by
//! `roxmltree` (the parser resvg uses, re-exported by usvg – no own parser, CLAUDE.md §4).

use crate::error::{FsError, FsErrorCode};
use resvg::usvg::roxmltree::{self, Node, ParsingOptions};

/// Largest symbol file (bytes).
pub const MAX_SVG_BYTES: usize = 256 * 1024;
/// Most XML nodes of one file (elements, text, comments).
pub const MAX_NODES: u32 = 20_000;
/// Most shapes and groups kept.
pub const MAX_ELEMENTS: usize = 4_000;
/// Deepest nesting of groups.
pub const MAX_DEPTH: usize = 32;
/// Longest name, tag and number of tags.
pub const MAX_NAME_CHARS: usize = 80;
pub const MAX_TAG_CHARS: usize = 32;
pub const MAX_TAGS: usize = 16;

const SVG_NS: &str = "http://www.w3.org/2000/svg";
/// The attribute of the root that carries the tags (`data-tags="star, shape"`).
pub const TAGS_ATTR: &str = "data-tags";

/// Shapes kept (as written); `<g>` is the only container.
const SHAPES: [&str; 7] = [
    "path", "circle", "ellipse", "rect", "line", "polyline", "polygon",
];

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    /// A number or length (`12`, `1.5px`, `50%`).
    Number,
    /// Path data, points, transform, dash array.
    Data,
    /// A colour or `none`.
    Paint,
    /// A keyword (`round`, `evenodd`).
    Keyword,
}

/// The allowed attributes (no namespace) and what their value may be.
fn kind_of(name: &str) -> Option<Kind> {
    Some(match name {
        "cx" | "cy" | "r" | "rx" | "ry" | "x" | "y" | "width" | "height" | "x1" | "y1" | "x2"
        | "y2" | "stroke-width" | "stroke-miterlimit" | "stroke-dashoffset" | "opacity"
        | "fill-opacity" | "stroke-opacity" => Kind::Number,
        "d" | "points" | "transform" | "stroke-dasharray" => Kind::Data,
        "fill" | "stroke" => Kind::Paint,
        "stroke-linecap" | "stroke-linejoin" | "fill-rule" | "clip-rule" => Kind::Keyword,
        _ => return None,
    })
}

/// Whether `value` is safe for an attribute of `kind`: a closed set of characters (no quotes,
/// `<`, `&`, `:`, `\`, `;`, `/`, `#` outside paint) and never `url`, `var(` or `expression`.
fn value_ok(kind: Kind, value: &str) -> bool {
    let (max, extra): (usize, &str) = match kind {
        Kind::Number => (64, ".+-% "),
        Kind::Data => (64 * 1024, ".,+-() \t\r\n"),
        Kind::Paint => (64, "#.,+-()% "),
        Kind::Keyword => (16, "-"),
    };
    !value.is_empty()
        && value.len() <= max
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || extra.contains(c))
        && {
            let lower = value.to_ascii_lowercase();
            !lower.contains("url") && !lower.contains("var(") && !lower.contains("expression")
        }
}

/// A symbol SVG after cleaning.
#[derive(Debug, Clone, PartialEq)]
pub struct Parsed {
    /// `min-x min-y width height` (width and height > 0).
    pub view_box: [f64; 4],
    /// The root's paint attributes (kept on a wrapping `<g>`).
    pub paint: Vec<(String, String)>,
    /// The cleaned content (shapes and groups), already serialised.
    pub body: String,
    /// The `<title>` of the root, cleaned.
    pub title: Option<String>,
    /// The tags of the root (`data-tags`), cleaned.
    pub tags: Vec<String>,
    /// Number of shapes kept (at least one).
    pub shapes: usize,
}

fn invalid(message: impl Into<String>) -> FsError {
    FsError::new(FsErrorCode::InvalidSvg, message, None)
}

/// A name for the library: trimmed, without control characters, single spaces, at most
/// [`MAX_NAME_CHARS`]; `None` when nothing is left.
pub fn clean_name(name: &str) -> Option<String> {
    let words: Vec<&str> = name
        .split(|c: char| c.is_whitespace() || c.is_control())
        .filter(|w| !w.is_empty())
        .collect();
    let joined: String = words.join(" ").chars().take(MAX_NAME_CHARS).collect();
    let trimmed = joined.trim_end().to_owned();
    (!trimmed.is_empty()).then_some(trimmed)
}

/// Tags: each like a name but lower case, without commas, at most [`MAX_TAG_CHARS`]; no
/// duplicates, at most [`MAX_TAGS`].
pub fn clean_tags<'a>(tags: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for t in tags {
        let t = t.replace(',', " ").to_lowercase();
        let Some(t) = clean_name(&t) else { continue };
        let t: String = t.chars().take(MAX_TAG_CHARS).collect::<String>();
        let t = t.trim_end().to_owned();
        if !out.contains(&t) {
            out.push(t);
        }
        if out.len() == MAX_TAGS {
            break;
        }
    }
    out
}

fn is_svg(n: &Node) -> bool {
    matches!(n.tag_name().namespace(), None | Some(SVG_NS))
}

fn number_list(s: &str) -> Option<Vec<f64>> {
    s.split(|c: char| c == ',' || c.is_whitespace())
        .filter(|p| !p.is_empty())
        .map(|p| p.parse::<f64>().ok().filter(|v| v.is_finite()))
        .collect()
}

/// A plain length in user units (`24`, `24px`); `None` for percentages and other units.
fn plain_length(s: Option<&str>) -> Option<f64> {
    let s = s?.trim();
    let s = s.strip_suffix("px").unwrap_or(s);
    s.parse::<f64>().ok().filter(|v| v.is_finite() && *v > 0.0)
}

fn view_box_of(root: &Node) -> Result<[f64; 4], FsError> {
    if let Some(vb) = root.attribute("viewBox") {
        let v = number_list(vb).ok_or_else(|| invalid("bad viewBox"))?;
        if v.len() != 4 || v[2] <= 0.0 || v[3] <= 0.0 {
            return Err(invalid("bad viewBox"));
        }
        return Ok([v[0], v[1], v[2], v[3]]);
    }
    match (
        plain_length(root.attribute("width")),
        plain_length(root.attribute("height")),
    ) {
        (Some(w), Some(h)) => Ok([0.0, 0.0, w, h]),
        _ => Err(invalid(
            "the SVG has neither a viewBox nor a width and height",
        )),
    }
}

/// The allowed attributes of `n` as `(name, value)`, in document order.
fn attributes(n: &Node) -> Vec<(String, String)> {
    n.attributes()
        .filter(|a| a.namespace().is_none())
        .filter_map(|a| {
            let kind = kind_of(a.name())?;
            let v = a.value().trim();
            value_ok(kind, v).then(|| (a.name().to_owned(), v.to_owned()))
        })
        .collect()
}

fn write_attrs(out: &mut String, attrs: &[(String, String)]) {
    for (k, v) in attrs {
        // the values passed `value_ok`: no quotes, `<` or `&` to escape
        out.push_str(&format!(" {k}=\"{v}\""));
    }
}

struct Walk {
    elements: usize,
    shapes: usize,
}

impl Walk {
    /// The cleaned children of `parent`; `Err` when a limit is passed.
    fn children(&mut self, parent: &Node, depth: usize, out: &mut String) -> Result<(), FsError> {
        if depth > MAX_DEPTH {
            return Err(invalid(format!("nested deeper than {MAX_DEPTH} groups")));
        }
        for n in parent.children().filter(|n| n.is_element() && is_svg(n)) {
            let name = n.tag_name().name();
            if name == "g" {
                let mut inner = String::new();
                let before = self.shapes;
                self.children(&n, depth + 1, &mut inner)?;
                if self.shapes == before {
                    continue; // an empty group is no part of the symbol
                }
                self.count()?;
                out.push_str("<g");
                write_attrs(out, &attributes(&n));
                out.push('>');
                out.push_str(&inner);
                out.push_str("</g>");
            } else if SHAPES.contains(&name) {
                let attrs = attributes(&n);
                let drawable = match name {
                    "path" => attrs.iter().any(|(k, _)| k == "d"),
                    "polyline" | "polygon" => attrs.iter().any(|(k, _)| k == "points"),
                    _ => true,
                };
                if !drawable {
                    continue;
                }
                self.count()?;
                self.shapes += 1;
                out.push('<');
                out.push_str(name);
                write_attrs(out, &attrs);
                out.push_str("/>");
            }
            // anything else (script, style, text, image, use, defs, foreignObject …) is dropped
        }
        Ok(())
    }

    fn count(&mut self) -> Result<(), FsError> {
        self.elements += 1;
        if self.elements > MAX_ELEMENTS {
            return Err(FsError::new(
                FsErrorCode::TooLarge,
                format!("more than {MAX_ELEMENTS} elements"),
                None,
            ));
        }
        Ok(())
    }
}

/// Parses and cleans a symbol SVG (see the module docs). `invalid_svg` for something that is no
/// SVG or draws nothing, `too_large` beyond the limits.
pub fn parse(text: &str) -> Result<Parsed, FsError> {
    if text.len() > MAX_SVG_BYTES {
        return Err(FsError::new(
            FsErrorCode::TooLarge,
            format!("{} bytes, limit {MAX_SVG_BYTES}", text.len()),
            None,
        ));
    }
    let options = ParsingOptions {
        allow_dtd: false,
        nodes_limit: MAX_NODES,
        ..ParsingOptions::default()
    };
    let doc = roxmltree::Document::parse_with_options(text, options)
        .map_err(|e| invalid(e.to_string()))?;
    let root = doc.root_element();
    if root.tag_name().name() != "svg" || !is_svg(&root) {
        return Err(invalid("the root element is not <svg>"));
    }
    let view_box = view_box_of(&root)?;
    let paint = attributes(&root)
        .into_iter()
        .filter(|(k, _)| !matches!(k.as_str(), "width" | "height" | "x" | "y"))
        .collect();
    let title = root
        .children()
        .find(|n| n.is_element() && is_svg(n) && n.tag_name().name() == "title")
        .and_then(|t| t.text())
        .and_then(clean_name);
    let tags = clean_tags(root.attribute(TAGS_ATTR).unwrap_or("").split(','));
    let mut walk = Walk {
        elements: 0,
        shapes: 0,
    };
    let mut body = String::new();
    walk.children(&root, 0, &mut body)?;
    if walk.shapes == 0 {
        return Err(invalid("the SVG draws no shape a symbol can keep"));
    }
    Ok(Parsed {
        view_box,
        paint,
        body,
        title,
        tags,
        shapes: walk.shapes,
    })
}

fn escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn num(v: f64) -> String {
    let s = format!("{v:.4}");
    let s = s.trim_end_matches('0').trim_end_matches('.');
    if s == "-0" { "0".into() } else { s.into() }
}

/// The canonical file of a symbol: `<svg viewBox data-tags><title>name</title>…</svg>`.
pub fn write(p: &Parsed, name: &str, tags: &[String]) -> String {
    let [x, y, w, h] = p.view_box;
    let mut out = format!(
        "<svg xmlns=\"{SVG_NS}\" viewBox=\"{} {} {} {}\"",
        num(x),
        num(y),
        num(w),
        num(h)
    );
    if !tags.is_empty() {
        out.push_str(&format!(" {TAGS_ATTR}=\"{}\"", escape(&tags.join(", "))));
    }
    out.push_str(&format!("><title>{}</title>", escape(name)));
    if p.paint.is_empty() {
        out.push_str(&p.body);
    } else {
        out.push_str("<g");
        write_attrs(&mut out, &p.paint);
        out.push('>');
        out.push_str(&p.body);
        out.push_str("</g>");
    }
    out.push_str("</svg>\n");
    out
}

#[cfg(test)]
#[path = "clean_tests.rs"]
mod tests;
