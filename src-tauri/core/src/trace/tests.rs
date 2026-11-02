//! Tracing end to end (prompt 087): synthetic images traced, the SVG checked and rendered back
//! with resvg (the export renderer) to compare with the original.

use super::raster::{Rgba, encode_png};
use super::*;
use crate::export::png::render_png;
use resvg::usvg::fontdb::Database;
use std::sync::Arc;

fn fill(img: &mut Rgba, f: impl Fn(f64, f64) -> Option<[u8; 4]>) {
    for y in 0..img.height {
        for x in 0..img.width {
            if let Some(c) = f(x as f64 + 0.5, y as f64 + 0.5) {
                img.set(x, y, c);
            }
        }
    }
}

fn in_round_rect(x: f64, y: f64, l: f64, t: f64, w: f64, h: f64, r: f64) -> bool {
    let (cx, cy) = (l + w / 2.0, t + h / 2.0);
    let qx = (x - cx).abs() - (w / 2.0 - r);
    let qy = (y - cy).abs() - (h / 2.0 - r);
    (qx.max(0.0).powi(2) + qy.max(0.0).powi(2)).sqrt() + qx.max(qy).min(0.0) - r <= 0.0
}

/// A small "icon": a vertical gradient background, a white rounded card, a red circle and three
/// equal dark keys.
fn icon() -> Rgba {
    let mut img = Rgba::new(256, 256);
    fill(&mut img, |_, y| {
        let v = (60.0 + 120.0 * y / 256.0) as u8;
        Some([v / 2, v / 2, v, 255])
    });
    fill(&mut img, |x, y| {
        in_round_rect(x, y, 24.0, 24.0, 208.0, 96.0, 16.0).then_some([245, 245, 240, 255])
    });
    fill(&mut img, |x, y| {
        (((x - 72.0).powi(2) + (y - 72.0).powi(2)).sqrt() <= 28.0).then_some([220, 40, 40, 255])
    });
    for i in 0..3 {
        let l = 24.0 + i as f64 * 72.0;
        fill(&mut img, |x, y| {
            in_round_rect(x, y, l, 150.0, 64.0, 64.0, 10.0).then_some([30, 34, 44, 255])
        });
    }
    img
}

fn shapes_options() -> TraceOptions {
    TraceOptions {
        shapes: true,
        gradients: true,
        harmonize: true,
        ..TraceOptions::default()
    }
}

/// Mean absolute difference per channel (0–255) between the image and the rendered trace.
fn difference(img: &Rgba, svg: &str) -> f64 {
    let pixmap = render_png(svg, img.width, Arc::new(Database::new())).unwrap();
    let mut sum = 0.0;
    for (i, p) in pixmap.pixels().iter().enumerate() {
        let c = p.demultiply();
        let o = &img.data[i * 4..i * 4 + 4];
        sum += (c.red() as f64 - o[0] as f64).abs()
            + (c.green() as f64 - o[1] as f64).abs()
            + (c.blue() as f64 - o[2] as f64).abs();
    }
    sum / (img.width * img.height * 3) as f64
}

fn count(svg: &str, tag: &str) -> usize {
    svg.matches(&format!("<{tag} ")).count()
}

#[test]
fn stage_a_traces_paths_that_look_like_the_image() {
    let img = icon();
    let r = trace(&img, &TraceOptions::default()).unwrap();
    assert!(r.svg.starts_with(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">"#
    ));
    assert_eq!(count(&r.svg, "rect") + count(&r.svg, "circle"), 0);
    assert!(r.stats.paths >= 5, "{:?}", r.stats);
    assert_eq!(r.stats.elements, r.stats.paths);
    // the smooth background gradient becomes flat colours in stage A
    let diff = difference(&img, &r.svg);
    assert!(diff < 14.0, "difference {diff}");
}

#[test]
fn stage_b_draws_it_as_a_user_would() {
    let img = icon();
    let r = trace(&img, &shapes_options()).unwrap();
    // the background gradient is one region with a linearGradient, not bands
    assert_eq!(r.stats.gradients, 1, "{}", r.svg);
    assert!(r.svg.contains("<linearGradient id=\"trace-gradient-1\""));
    // the card and three keys are rounded rectangles, the dot a circle
    assert_eq!(count(&r.svg, "circle"), 1, "{}", r.svg);
    assert!(count(&r.svg, "rect") >= 4, "{}", r.svg);
    // equal keys: one size and one radius
    let keys: Vec<&str> = r
        .svg
        .split("<rect ")
        .skip(1)
        .filter(|s| s.contains("height=\"64\""))
        .collect();
    assert_eq!(keys.len(), 3, "{}", r.svg);
    assert!(
        keys.iter()
            .all(|k| k.contains("width=\"64\"") && k.contains("rx=\"10\""))
    );
    assert!(keys.iter().all(|k| k.contains("y=\"150\"")));
    let diff = difference(&img, &r.svg);
    assert!(diff < 6.0, "difference {diff}");
    // no free-form paths left; stage A has only paths
    assert_eq!(r.stats.paths, 0, "{:?}", r.stats);
    let a = trace(&img, &TraceOptions::default()).unwrap();
    assert_eq!(a.stats.paths, a.stats.elements);
}

#[test]
fn scale_moves_every_coordinate_into_output_units() {
    let img = icon();
    let opts = TraceOptions {
        scale: 4.0,
        ..shapes_options()
    };
    let r = trace(&img, &opts).unwrap();
    assert_eq!((r.width, r.height), (1024.0, 1024.0));
    assert!(r.svg.contains(r#"viewBox="0 0 1024 1024""#));
    assert!(r.svg.contains(r#"height="256" rx="40""#), "{}", r.svg);
    assert!(
        r.svg.contains("<circle cx=\"288\" cy=\"288\" r=\"112"),
        "{}",
        r.svg
    );
    let diff = difference(&img, &r.svg);
    assert!(diff < 6.0, "difference {diff}");
}

#[test]
fn transparent_surroundings_stay_empty_and_a_full_background_can_go() {
    let mut img = Rgba::new(100, 100);
    fill(&mut img, |x, y| {
        in_round_rect(x, y, 10.0, 10.0, 80.0, 80.0, 20.0).then_some([0, 120, 255, 255])
    });
    let r = trace(&img, &shapes_options()).unwrap();
    assert_eq!(r.stats.elements, 1, "{}", r.svg);
    assert!(r.svg.contains("<rect ") && r.svg.contains("#0078ff"));

    let mut flat = Rgba::new(60, 60);
    fill(&mut flat, |_, _| Some([255, 255, 255, 255]));
    fill(&mut flat, |x, y| {
        (x > 20.0 && x < 40.0 && y > 20.0 && y < 40.0).then_some([0, 0, 0, 255])
    });
    let with = trace(&flat, &shapes_options()).unwrap();
    let without = trace(
        &flat,
        &TraceOptions {
            drop_background: true,
            ..shapes_options()
        },
    )
    .unwrap();
    assert_eq!(with.stats.elements, 2);
    assert_eq!(without.stats.elements, 1);
    assert!(!without.svg.contains("#ffffff"));
}

#[test]
fn black_and_white_and_pixel_steps() {
    let mut img = Rgba::new(40, 40);
    fill(&mut img, |_, _| Some([255, 255, 255, 255]));
    // a staircase (pixel art)
    fill(&mut img, |x, y| {
        ((x as u32) / 8 <= (y as u32) / 8).then_some([10, 10, 10, 255])
    });
    let opts = TraceOptions {
        mode: ColorMode::Mono,
        curves: CurveMode::Pixel,
        ..TraceOptions::default()
    };
    let r = trace(&img, &opts).unwrap();
    assert_eq!(r.stats.paths, 1, "{}", r.svg);
    assert!(r.svg.contains("fill=\"#000000\""));
    let d = r
        .svg
        .split("d=\"")
        .nth(1)
        .unwrap()
        .split('"')
        .next()
        .unwrap();
    assert!(!d.contains('C'), "{d}");
    // only horizontal and vertical steps of 8 pixels
    assert!(d.contains("L8 8") || d.contains("L8 0"), "{d}");
}

#[test]
fn holes_are_even_odd() {
    let mut img = Rgba::new(60, 60);
    fill(&mut img, |_, _| Some([255, 255, 255, 255]));
    fill(&mut img, |x, y| {
        let d = ((x - 30.0).powi(2) + (y - 30.0).powi(2)).sqrt();
        (10.0..=22.0).contains(&d).then_some([0, 0, 0, 255])
    });
    let opts = TraceOptions {
        mode: ColorMode::Mono,
        ..TraceOptions::default()
    };
    let r = trace(&img, &opts).unwrap();
    assert!(r.svg.contains(r#"fill-rule="evenodd""#), "{}", r.svg);
}

#[test]
fn data_urls_and_limits() {
    use base64::Engine;
    let png = encode_png(&icon()).unwrap();
    let url = format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&png)
    );
    assert!(trace_data_url(&url, &TraceOptions::default()).is_ok());
    let err = trace_data_url("data:image/jpeg;base64,AAAA", &TraceOptions::default()).unwrap_err();
    assert_eq!(err.code, FsErrorCode::InvalidImage);
    for bad in [
        TraceOptions {
            color_precision: 0,
            ..TraceOptions::default()
        },
        TraceOptions {
            speckle: 500,
            ..TraceOptions::default()
        },
        TraceOptions {
            scale: 0.0,
            ..TraceOptions::default()
        },
        TraceOptions {
            length_threshold: 2.0,
            ..TraceOptions::default()
        },
        TraceOptions {
            corner_threshold: f64::NAN,
            ..TraceOptions::default()
        },
    ] {
        assert_eq!(
            trace_png(&png, &bad).unwrap_err().code,
            FsErrorCode::InvalidRequest
        );
    }
}

#[test]
fn options_are_camel_case_and_default_per_field() {
    let o: TraceOptions =
        serde_json::from_str(r#"{"curves":"polygon","shapes":true,"dropBackground":true}"#)
            .unwrap();
    assert_eq!(o.curves, CurveMode::Polygon);
    assert!(o.shapes && o.drop_background);
    assert_eq!(o.color_precision, 6);
    let r = trace(&icon(), &o).unwrap();
    let json = serde_json::to_value(&r.stats).unwrap();
    assert!(json.get("elements").is_some() && json.get("ms").is_some());
}

#[test]
fn large_images_are_traced_at_the_work_size_but_answer_in_their_own_units() {
    let mut img = Rgba::new(WORK_SIDE * 2, 64);
    fill(&mut img, |x, _| {
        Some(if x < WORK_SIDE as f64 {
            [0, 0, 0, 255]
        } else {
            [255, 255, 255, 255]
        })
    });
    let r = trace(
        &img,
        &TraceOptions {
            shapes: true,
            ..TraceOptions::default()
        },
    )
    .unwrap();
    assert_eq!(r.width, (WORK_SIDE * 2) as f64);
    assert!(
        r.svg
            .contains(&format!(r#"width="{}" height="64""#, WORK_SIDE)),
        "{}",
        r.svg
    );
}
