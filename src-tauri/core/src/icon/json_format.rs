//! `icon.json` written like Icon Composer (`JSONEncoder` with `.prettyPrinted`, design 002 E2):
//! two spaces, `"key" : value`, whole floats without `.0`, no newline at the end.
//! Keys are written in the order of the `Value` (feature `preserve_order`, 002 E4).

use serde::Serialize;
use serde_json::Value;
use serde_json::ser::{CompactFormatter, Formatter};
use std::io::{self, Write};

/// Pretty printer in the style of Icon Composer.
#[derive(Default)]
struct IconComposerFormatter {
    indent: usize,
    has_value: bool,
}

impl IconComposerFormatter {
    fn newline_indent<W: ?Sized + Write>(&self, w: &mut W) -> io::Result<()> {
        w.write_all(b"\n")?;
        for _ in 0..self.indent {
            w.write_all(b"  ")?;
        }
        Ok(())
    }

    fn open<W: ?Sized + Write>(&mut self, w: &mut W, c: &[u8]) -> io::Result<()> {
        self.indent += 1;
        self.has_value = false;
        w.write_all(c)
    }

    fn close<W: ?Sized + Write>(&mut self, w: &mut W, c: &[u8]) -> io::Result<()> {
        self.indent -= 1;
        if self.has_value {
            self.newline_indent(w)?;
        }
        w.write_all(c)
    }

    fn item<W: ?Sized + Write>(&mut self, w: &mut W, first: bool) -> io::Result<()> {
        if !first {
            w.write_all(b",")?;
        }
        self.newline_indent(w)
    }
}

impl Formatter for IconComposerFormatter {
    fn begin_array<W: ?Sized + Write>(&mut self, w: &mut W) -> io::Result<()> {
        self.open(w, b"[")
    }
    fn end_array<W: ?Sized + Write>(&mut self, w: &mut W) -> io::Result<()> {
        self.close(w, b"]")
    }
    fn begin_array_value<W: ?Sized + Write>(&mut self, w: &mut W, first: bool) -> io::Result<()> {
        self.item(w, first)
    }
    fn end_array_value<W: ?Sized + Write>(&mut self, _w: &mut W) -> io::Result<()> {
        self.has_value = true;
        Ok(())
    }
    fn begin_object<W: ?Sized + Write>(&mut self, w: &mut W) -> io::Result<()> {
        self.open(w, b"{")
    }
    fn end_object<W: ?Sized + Write>(&mut self, w: &mut W) -> io::Result<()> {
        self.close(w, b"}")
    }
    fn begin_object_key<W: ?Sized + Write>(&mut self, w: &mut W, first: bool) -> io::Result<()> {
        self.item(w, first)
    }
    fn begin_object_value<W: ?Sized + Write>(&mut self, w: &mut W) -> io::Result<()> {
        w.write_all(b" : ")
    }
    fn end_object_value<W: ?Sized + Write>(&mut self, _w: &mut W) -> io::Result<()> {
        self.has_value = true;
        Ok(())
    }
    /// `JSONEncoder` writes `1.0` as `1`.
    fn write_f64<W: ?Sized + Write>(&mut self, w: &mut W, value: f64) -> io::Result<()> {
        if value.fract() == 0.0 && value.abs() < 1e15 {
            write!(w, "{}", value as i64)
        } else {
            CompactFormatter.write_f64(w, value)
        }
    }
}

/// `icon.json` bytes in the style of Icon Composer.
pub fn format_icon_json(value: &Value) -> Vec<u8> {
    let mut out = Vec::new();
    let mut ser =
        serde_json::Serializer::with_formatter(&mut out, IconComposerFormatter::default());
    value
        .serialize(&mut ser)
        .expect("serialising a Value into memory cannot fail");
    out
}

/// A copy of `value` with all object keys sorted (what Icon Composer writes, design 002 E4).
pub fn sort_keys(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<_> = map.keys().collect();
            keys.sort();
            Value::Object(
                keys.into_iter()
                    .map(|k| (k.clone(), sort_keys(&map[k])))
                    .collect(),
            )
        }
        Value::Array(items) => Value::Array(items.iter().map(sort_keys).collect()),
        other => other.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::icon::testdata::camscanner_json;
    use serde_json::json;

    #[test]
    fn formats_the_fixture_byte_for_byte() {
        let original = camscanner_json();
        let value: Value = serde_json::from_slice(&original).unwrap();
        assert_eq!(
            String::from_utf8(format_icon_json(&value)).unwrap(),
            String::from_utf8(original).unwrap()
        );
    }

    #[test]
    fn keeps_key_order_and_writes_whole_floats_as_integers() {
        let v = json!({ "z": 1.0, "a": [0.5, 2], "m": {}, "e": [], "s": "ä/😀" });
        assert_eq!(
            String::from_utf8(format_icon_json(&v)).unwrap(),
            "{\n  \"z\" : 1,\n  \"a\" : [\n    0.5,\n    2\n  ],\n  \"m\" : {},\n  \"e\" : [],\n  \"s\" : \"ä/😀\"\n}"
        );
    }

    #[test]
    fn sorts_keys_recursively() {
        let v = json!({ "b": { "y": 1, "x": [ { "d": 1, "c": 2 } ] }, "a": null });
        let sorted = serde_json::to_string(&sort_keys(&v)).unwrap();
        assert_eq!(sorted, r#"{"a":null,"b":{"x":[{"c":2,"d":1}],"y":1}}"#);
    }
}
