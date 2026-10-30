use super::*;

const STAR: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000"><title>Star</title><path d="M12 2l3 7h7l-6 4 2 7-6-4-6 4 2-7-6-4h7z"/></svg>"##;

fn clean(text: &str) -> String {
    let p = parse(text).unwrap();
    write(&p, "x", &[])
}

#[test]
fn keeps_shapes_groups_paint_and_title() {
    let p = parse(STAR).unwrap();
    assert_eq!(p.view_box, [0.0, 0.0, 24.0, 24.0]);
    assert_eq!(p.title.as_deref(), Some("Star"));
    assert_eq!(p.shapes, 1);
    let out = write(&p, "Star", &["shape".into(), "favourite".into()]);
    assert_eq!(
        out,
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" data-tags=\"shape, favourite\"><title>Star</title><g fill=\"none\" stroke=\"#000\"><path d=\"M12 2l3 7h7l-6 4 2 7-6-4-6 4 2-7-6-4h7z\"/></g></svg>\n"
    );
    // the written file reads back the same (stable)
    let again = parse(&out).unwrap();
    assert_eq!(again.tags, vec!["shape", "favourite"]);
    assert_eq!(write(&again, "Star", &again.tags), out);
}

#[test]
fn every_basic_shape_and_nested_groups_survive() {
    let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="32px" height="16"><g transform="translate(1 2)"><g opacity=".5"><circle cx="4" cy="4" r="3"/><ellipse cx="1" cy="1" rx="1" ry="2"/></g><rect x="1" y="1" width="3" height="3" rx="1"/><line x1="0" y1="0" x2="5" y2="5" stroke-linecap="round"/><polyline points="0,0 1,1"/><polygon points="0 0 1 0 1 1" fill-rule="evenodd"/></g></svg>"#;
    let p = parse(svg).unwrap();
    assert_eq!(p.view_box, [0.0, 0.0, 32.0, 16.0]);
    assert_eq!(p.shapes, 6);
    assert_eq!(
        p.body,
        "<g transform=\"translate(1 2)\"><g opacity=\".5\"><circle cx=\"4\" cy=\"4\" r=\"3\"/><ellipse cx=\"1\" cy=\"1\" rx=\"1\" ry=\"2\"/></g><rect x=\"1\" y=\"1\" width=\"3\" height=\"3\" rx=\"1\"/><line x1=\"0\" y1=\"0\" x2=\"5\" y2=\"5\" stroke-linecap=\"round\"/><polyline points=\"0,0 1,1\"/><polygon points=\"0 0 1 0 1 1\" fill-rule=\"evenodd\"/></g>"
    );
}

#[test]
fn hostile_markup_is_removed() {
    let evil = r##"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" onload="alert(1)">
      <script>alert(1)</script>
      <style>path { fill: url(https://evil.example/x.svg) }</style>
      <foreignObject><iframe xmlns="http://www.w3.org/1999/xhtml" src="https://evil.example"/></foreignObject>
      <image href="https://evil.example/track.png" width="10" height="10"/>
      <use xlink:href="https://evil.example/s.svg#a"/>
      <a href="javascript:alert(1)"><path d="M0 0h1"/></a>
      <text>hi</text>
      <defs><linearGradient id="g"/></defs>
      <path d="M0 0h10v10z" onclick="alert(1)" style="fill:url(https://evil.example/)" fill="url(#g)"
            stroke="javascript:alert(1)" class="x" id="p" xml:base="https://evil.example/"
            data-x="1" transform="matrix(1 0 0 1 0 0)" stroke-width="1&#59;background:url(x)"/>
      <set attributeName="href" to="javascript:alert(1)"/>
      <animate attributeName="d"/>
      <svg viewBox="0 0 1 1"><path d="M0 0"/></svg>
    </svg>"##;
    let out = clean(evil);
    assert_eq!(
        out,
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><title>x</title><path d=\"M0 0h10v10z\" transform=\"matrix(1 0 0 1 0 0)\"/></svg>\n"
    );
    for bad in [
        "script",
        "onload",
        "onclick",
        "url",
        "javascript",
        "style",
        "href",
        "image",
        "<a",
        "text",
        "class",
        "id=",
        "base",
        "data-x",
    ] {
        assert!(!out.contains(bad), "{bad} in {out}");
    }
}

#[test]
fn paint_values_are_a_closed_set() {
    for (fill, kept) in [
        ("#ff0000", true),
        ("rgb(255, 0, 0)", true),
        ("currentColor", true),
        ("none", true),
        ("hsl(10 50% 50%)", true),
        ("url(#a)", false),
        ("URL(#a)", false),
        ("red;x:y", false),
        ("\\75 rl(x)", false),
        ("var(--x)", false),
        ("\"x\"", false),
    ] {
        let svg = format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0" fill='{fill}'/></svg>"#
        );
        assert_eq!(clean(&svg).contains("fill="), kept, "{fill}");
    }
}

#[test]
fn rejects_what_is_no_symbol() {
    for (text, code) in [
        ("", FsErrorCode::InvalidSvg),
        ("<html/>", FsErrorCode::InvalidSvg),
        ("not xml", FsErrorCode::InvalidSvg),
        (
            r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><text>no shape</text></svg>"#,
            FsErrorCode::InvalidSvg,
        ),
        (
            r#"<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>"#,
            FsErrorCode::InvalidSvg,
        ),
        (
            r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 1"><path d="M0 0"/></svg>"#,
            FsErrorCode::InvalidSvg,
        ),
        (
            r#"<svg xmlns="http://www.w3.org/1999/xhtml" viewBox="0 0 1 1"><path d="M0 0"/></svg>"#,
            FsErrorCode::InvalidSvg,
        ),
        // entities and DTDs (billion laughs, external entities) are refused by the parser
        (
            r#"<!DOCTYPE svg [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0"/><title>&b;</title></svg>"#,
            FsErrorCode::InvalidSvg,
        ),
        (
            r#"<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><title>&x;</title><path d="M0 0"/></svg>"#,
            FsErrorCode::InvalidSvg,
        ),
    ] {
        assert_eq!(parse(text).unwrap_err().code, code, "{text}");
    }
}

#[test]
fn limits_size_count_and_depth() {
    let big = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0"/><!--{}--></svg>"#,
        "x".repeat(MAX_SVG_BYTES)
    );
    assert_eq!(parse(&big).unwrap_err().code, FsErrorCode::TooLarge);
    let many = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">{}</svg>"#,
        "<path d=\"M0 0\"/>".repeat(MAX_ELEMENTS + 1)
    );
    assert_eq!(parse(&many).unwrap_err().code, FsErrorCode::TooLarge);
    let deep = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">{}<path d="M0 0"/>{}</svg>"#,
        "<g>".repeat(MAX_DEPTH + 2),
        "</g>".repeat(MAX_DEPTH + 2)
    );
    assert_eq!(parse(&deep).unwrap_err().code, FsErrorCode::InvalidSvg);
    let nodes = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0"/>{}</svg>"#,
        "<x/>".repeat(MAX_NODES as usize)
    );
    assert_eq!(parse(&nodes).unwrap_err().code, FsErrorCode::InvalidSvg);
    // a very long path is fine up to 64 KiB, beyond it the attribute is dropped
    let long = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0{}"/><circle r="1"/></svg>"#,
        "h1".repeat(40 * 1024)
    );
    let p = parse(&long).unwrap();
    assert_eq!(p.shapes, 1);
}

#[test]
fn names_and_tags_are_cleaned() {
    assert_eq!(clean_name("  My\tStar \u{7}\n"), Some("My Star".into()));
    assert_eq!(clean_name(" \n "), None);
    assert_eq!(
        clean_name(&"a".repeat(200)).unwrap().chars().count(),
        MAX_NAME_CHARS
    );
    assert_eq!(
        clean_tags(["Shape", " shape ", "a,b", "", "x\u{0}y"]),
        vec!["shape", "a b", "x y"]
    );
    let many: Vec<String> = (0..40).map(|i| format!("t{i}")).collect();
    assert_eq!(clean_tags(many.iter().map(String::as_str)).len(), MAX_TAGS);
    // title and tags are escaped on writing
    let p = parse(STAR).unwrap();
    let out = write(&p, "<a & \"b\">", &["x<y".into()]);
    assert!(
        out.contains("<title>&lt;a &amp; &quot;b&quot;&gt;</title>"),
        "{out}"
    );
    assert!(out.contains("data-tags=\"x&lt;y\""), "{out}");
    assert_eq!(parse(&out).unwrap().title.as_deref(), Some("<a & \"b\">"));
}
