//! Raster images for tracing (prompt 087): PNG decoded into 8-bit RGBA with limits, scaled down
//! by area averaging, encoded again (the template image the AI sees, `fit_png`).

use crate::error::{FsError, FsErrorCode};
use std::io::Cursor;

/// Most pixels of an image to trace (4096 × 4096).
pub const MAX_PIXELS: u64 = 4096 * 4096;

/// An 8-bit RGBA image (not premultiplied), rows top to bottom.
#[derive(Debug, Clone, PartialEq)]
pub struct Rgba {
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>,
}

impl Rgba {
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            width,
            height,
            data: vec![0; width as usize * height as usize * 4],
        }
    }

    pub fn pixel(&self, x: u32, y: u32) -> [u8; 4] {
        let i = (y as usize * self.width as usize + x as usize) * 4;
        [
            self.data[i],
            self.data[i + 1],
            self.data[i + 2],
            self.data[i + 3],
        ]
    }

    pub fn set(&mut self, x: u32, y: u32, p: [u8; 4]) {
        let i = (y as usize * self.width as usize + x as usize) * 4;
        self.data[i..i + 4].copy_from_slice(&p);
    }
}

fn invalid(msg: impl Into<String>) -> FsError {
    FsError::new(FsErrorCode::InvalidImage, msg, None)
}

/// A PNG file as RGBA: every colour type and bit depth, at most [`MAX_PIXELS`]; else
/// `invalid_image` / `too_large`.
pub fn decode_png(bytes: &[u8]) -> Result<Rgba, FsError> {
    let mut decoder = png::Decoder::new(Cursor::new(bytes));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    decoder.set_limits(png::Limits {
        bytes: (MAX_PIXELS * 4) as usize + (1 << 20),
    });
    let mut reader = decoder.read_info().map_err(|e| {
        if matches!(e, png::DecodingError::LimitsExceeded) {
            FsError::new(FsErrorCode::TooLarge, "image too large", None)
        } else {
            invalid(format!("png: {e}"))
        }
    })?;
    let (w, h) = reader.info().size();
    if w == 0 || h == 0 {
        return Err(invalid("empty image"));
    }
    if w as u64 * h as u64 > MAX_PIXELS {
        return Err(FsError::new(
            FsErrorCode::TooLarge,
            format!("{w} × {h} pixels"),
            None,
        ));
    }
    let size = reader
        .output_buffer_size()
        .ok_or_else(|| invalid("png: size"))?;
    let mut buf = vec![0; size];
    let info = reader
        .next_frame(&mut buf)
        .map_err(|e| invalid(format!("png: {e}")))?;
    let line = info.line_size;
    let mut out = Rgba::new(w, h);
    for y in 0..h {
        let row = &buf[y as usize * line..];
        for x in 0..w {
            let i = x as usize;
            let p = match info.color_type {
                png::ColorType::Grayscale => [row[i], row[i], row[i], 255],
                png::ColorType::GrayscaleAlpha => {
                    [row[2 * i], row[2 * i], row[2 * i], row[2 * i + 1]]
                }
                png::ColorType::Rgb => [row[3 * i], row[3 * i + 1], row[3 * i + 2], 255],
                png::ColorType::Rgba => {
                    [row[4 * i], row[4 * i + 1], row[4 * i + 2], row[4 * i + 3]]
                }
                png::ColorType::Indexed => return Err(invalid("png: palette not expanded")),
            };
            out.set(x, y, p);
        }
    }
    Ok(out)
}

/// Scaled down so that the longer side is at most `max_side` (area average with alpha
/// weighting); smaller images come back unchanged.
pub fn fit(img: &Rgba, max_side: u32) -> Rgba {
    let long = img.width.max(img.height);
    if long <= max_side || max_side == 0 {
        return img.clone();
    }
    let f = max_side as f64 / long as f64;
    let w = ((img.width as f64 * f).round() as u32).max(1);
    let h = ((img.height as f64 * f).round() as u32).max(1);
    let sx = img.width as f64 / w as f64;
    let sy = img.height as f64 / h as f64;
    let mut out = Rgba::new(w, h);
    for y in 0..h {
        let y0 = y as f64 * sy;
        let y1 = y0 + sy;
        for x in 0..w {
            let x0 = x as f64 * sx;
            let x1 = x0 + sx;
            let mut acc = [0.0f64; 4];
            let mut area = 0.0;
            let mut yy = y0.floor() as u32;
            while (yy as f64) < y1 && yy < img.height {
                let wy = (y1.min(yy as f64 + 1.0) - y0.max(yy as f64)).max(0.0);
                let mut xx = x0.floor() as u32;
                while (xx as f64) < x1 && xx < img.width {
                    let wx = (x1.min(xx as f64 + 1.0) - x0.max(xx as f64)).max(0.0);
                    let wgt = wx * wy;
                    let p = img.pixel(xx, yy);
                    let a = p[3] as f64 * wgt;
                    acc[0] += p[0] as f64 * a;
                    acc[1] += p[1] as f64 * a;
                    acc[2] += p[2] as f64 * a;
                    acc[3] += a;
                    area += wgt;
                    xx += 1;
                }
                yy += 1;
            }
            let p = if acc[3] > 0.0 {
                [
                    (acc[0] / acc[3]).round() as u8,
                    (acc[1] / acc[3]).round() as u8,
                    (acc[2] / acc[3]).round() as u8,
                    (acc[3] / area).round().min(255.0) as u8,
                ]
            } else {
                [0, 0, 0, 0]
            };
            out.set(x, y, p);
        }
    }
    out
}

/// RGBA as a PNG file.
pub fn encode_png(img: &Rgba) -> Result<Vec<u8>, FsError> {
    let io = |e: png::EncodingError| FsError::new(FsErrorCode::Io, e.to_string(), None);
    let mut out = Vec::new();
    let mut enc = png::Encoder::new(&mut out, img.width, img.height);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    let mut w = enc.write_header().map_err(io)?;
    w.write_image_data(&img.data).map_err(io)?;
    w.finish().map_err(io)?;
    Ok(out)
}

/// A PNG fitted into `max_side` (the template image for the AI, prompt 087 E14): the PNG itself
/// when it is small enough, else scaled down and encoded anew. Answers bytes, width and height.
pub fn fit_png(bytes: &[u8], max_side: u32) -> Result<(Vec<u8>, u32, u32), FsError> {
    let img = decode_png(bytes)?;
    if img.width.max(img.height) <= max_side {
        return Ok((bytes.to_vec(), img.width, img.height));
    }
    let small = fit(&img, max_side);
    Ok((encode_png(&small)?, small.width, small.height))
}

/// PNG bytes as `data:image/png;base64,…`.
pub fn png_data_url(bytes: &[u8]) -> String {
    use base64::Engine;
    format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

/// A PNG data URL fitted into `max_side` (prompt 087 E14, `get_template` of the AI): base64 of
/// the PNG, width, height. Errors: `invalid_image`, `too_large`.
pub fn fit_png_base64(url: &str, max_side: u32) -> Result<(String, u32, u32), FsError> {
    use base64::Engine;
    let bytes =
        crate::icon::save::decode_png_data_url(url).ok_or_else(|| invalid("not a PNG data URL"))?;
    let (png, w, h) = fit_png(&bytes, max_side)?;
    Ok((base64::engine::general_purpose::STANDARD.encode(png), w, h))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn checker(w: u32, h: u32) -> Rgba {
        let mut img = Rgba::new(w, h);
        for y in 0..h {
            for x in 0..w {
                let v = if (x + y) % 2 == 0 { 255 } else { 0 };
                img.set(x, y, [v, v, v, 255]);
            }
        }
        img
    }

    #[test]
    fn png_round_trip_keeps_the_pixels() {
        let img = checker(5, 3);
        let back = decode_png(&encode_png(&img).unwrap()).unwrap();
        assert_eq!(back, img);
    }

    #[test]
    fn grey_and_rgb_pngs_become_rgba() {
        let mut out = Vec::new();
        let mut enc = png::Encoder::new(&mut out, 2, 1);
        enc.set_color(png::ColorType::Grayscale);
        enc.set_depth(png::BitDepth::Eight);
        let mut w = enc.write_header().unwrap();
        w.write_image_data(&[10, 200]).unwrap();
        w.finish().unwrap();
        let img = decode_png(&out).unwrap();
        assert_eq!(img.pixel(0, 0), [10, 10, 10, 255]);
        assert_eq!(img.pixel(1, 0), [200, 200, 200, 255]);
    }

    #[test]
    fn broken_files_are_invalid_images() {
        assert_eq!(
            decode_png(b"nope").unwrap_err().code,
            FsErrorCode::InvalidImage
        );
        let mut png = encode_png(&checker(4, 4)).unwrap();
        png.truncate(png.len() / 2);
        assert!(decode_png(&png).is_err());
    }

    #[test]
    fn fit_averages_and_keeps_small_images() {
        let img = checker(8, 4);
        assert_eq!(fit(&img, 8), img);
        let half = fit(&img, 4);
        assert_eq!((half.width, half.height), (4, 2));
        // every 2 × 2 block of the checker board is half white
        assert!(
            half.data
                .chunks(4)
                .all(|p| (p[0] as i32 - 128).abs() <= 1 && p[3] == 255)
        );
    }

    #[test]
    fn fit_ignores_the_colour_of_transparent_pixels() {
        let mut img = Rgba::new(2, 1);
        img.set(0, 0, [255, 0, 0, 255]);
        img.set(1, 0, [0, 255, 0, 0]);
        let one = fit(&img, 1);
        assert_eq!(one.pixel(0, 0), [255, 0, 0, 128]);
    }

    #[test]
    fn data_urls_are_fitted_to_base64() {
        let url = png_data_url(&encode_png(&checker(30, 60)).unwrap());
        let (b64, w, h) = fit_png_base64(&url, 20).unwrap();
        assert_eq!((w, h), (10, 20));
        let back = crate::icon::save::decode_png_data_url(&format!("data:image/png;base64,{b64}"));
        assert_eq!(decode_png(&back.unwrap()).unwrap().height, 20);
        assert!(fit_png_base64("data:image/gif;base64,R0lG", 20).is_err());
    }

    #[test]
    fn fit_png_answers_the_size() {
        let png = encode_png(&checker(40, 20)).unwrap();
        let (same, w, h) = fit_png(&png, 64).unwrap();
        assert_eq!((same, w, h), (png.clone(), 40, 20));
        let (small, w, h) = fit_png(&png, 10).unwrap();
        assert_eq!((w, h), (10, 5));
        assert_eq!(decode_png(&small).unwrap().width, 10);
    }
}
