//! An image from the system clipboard as PNG data URL (prompt 071): screenshots and images copied
//! in other apps are pasted like "Add › Image" (design 008 E8). The platform clipboard is read in
//! the app crate (`arboard`); this module only checks and encodes what it delivered – it never
//! trusts the source: sides and pixel count are limited, the buffer must fit the size, the PNG
//! must stay under the image limit of `image_file`.
//!
//! The other way (prompt 078 E7): [`copy_svg`] renders the icon with resvg and hands straight
//! RGBA to an [`ImageSink`] (the platform clipboard in the app crate, a fake in tests).

use crate::error::{FsError, FsErrorCode};
use crate::icon::image_file::{ImageFile, MAX_IMAGE};
use base64::Engine;
use resvg::tiny_skia::{IntSize, Pixmap};

/// Longest side in pixels.
pub const MAX_SIDE: u32 = 16_384;
/// Most pixels (64 MP – about a 8K × 8K screenshot).
pub const MAX_PIXELS: u64 = 64 * 1024 * 1024;

/// What a clipboard delivers: straight (not premultiplied) RGBA, row by row.
pub struct RgbaImage<'a> {
    pub width: u32,
    pub height: u32,
    pub bytes: &'a [u8],
}

/// A source of clipboard images (the platform clipboard, a fake in tests); `Ok(None)` = the
/// clipboard holds no image.
pub trait ImageSource {
    fn with_image<R>(&mut self, f: impl FnOnce(RgbaImage<'_>) -> R) -> Result<Option<R>, FsError>;
}

/// A target for an image (the platform clipboard, a fake in tests).
pub trait ImageSink {
    fn set_image(&mut self, img: RgbaImage<'_>) -> Result<(), FsError>;
}

/// Straight (not premultiplied) RGBA bytes of a pixmap, row by row.
pub fn straight_rgba(pixmap: &Pixmap) -> Vec<u8> {
    let mut out = Vec::with_capacity(pixmap.pixels().len() * 4);
    for p in pixmap.pixels() {
        let c = p.demultiply();
        out.extend_from_slice(&[c.red(), c.green(), c.blue(), c.alpha()]);
    }
    out
}

/// Renders `svg` square in `size` px (one of the export sizes) and puts it into `sink`.
pub fn copy_svg(
    svg: &str,
    size: u32,
    fonts: std::sync::Arc<resvg::usvg::fontdb::Database>,
    sink: &mut impl ImageSink,
) -> Result<(), FsError> {
    if !crate::export::PNG_SIZES.contains(&size) {
        return Err(FsError::new(
            FsErrorCode::InvalidRequest,
            format!("size {size} is not offered"),
            None,
        ));
    }
    let pixmap = crate::export::png::render_png(svg, size, fonts)?;
    let bytes = straight_rgba(&pixmap);
    sink.set_image(RgbaImage {
        width: size,
        height: size,
        bytes: &bytes,
    })
}

fn invalid(message: &str) -> FsError {
    FsError::new(FsErrorCode::InvalidImage, message, None)
}

/// The image as `clipboard.png` data URL with its size; `too_large` / `invalid_image` otherwise.
pub fn encode_png(img: RgbaImage<'_>) -> Result<ImageFile, FsError> {
    let (w, h) = (img.width, img.height);
    if w == 0 || h == 0 {
        return Err(invalid("empty image"));
    }
    if w > MAX_SIDE || h > MAX_SIDE || u64::from(w) * u64::from(h) > MAX_PIXELS {
        return Err(FsError::new(FsErrorCode::TooLarge, "image too large", None));
    }
    let len = (w as usize) * (h as usize) * 4;
    if img.bytes.len() != len {
        return Err(invalid("pixel buffer does not fit the size"));
    }
    // tiny-skia keeps premultiplied pixels (and writes straight ones into the PNG again)
    let mut data = img.bytes.to_vec();
    for px in data.chunks_exact_mut(4) {
        let a = u16::from(px[3]);
        if a < 255 {
            for c in &mut px[..3] {
                *c = ((u16::from(*c) * a + 127) / 255) as u8;
            }
        }
    }
    let size = IntSize::from_wh(w, h).ok_or_else(|| invalid("bad size"))?;
    let pixmap = Pixmap::from_vec(data, size).ok_or_else(|| invalid("bad pixels"))?;
    let png = pixmap
        .encode_png()
        .map_err(|e| FsError::new(FsErrorCode::Io, e.to_string(), None))?;
    if png.len() as u64 > MAX_IMAGE {
        return Err(FsError::new(FsErrorCode::TooLarge, "image too large", None));
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(&png);
    Ok(ImageFile {
        name: "clipboard.png".into(),
        mime: "image/png".into(),
        data_url: format!("data:image/png;base64,{b64}"),
        width: Some(w),
        height: Some(h),
    })
}

/// The clipboard's image as PNG; `None` if it holds none.
pub fn read_image(source: &mut impl ImageSource) -> Result<Option<ImageFile>, FsError> {
    source.with_image(encode_png)?.transpose()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::icon::image_file::{ImageKind, detect};

    struct Fake(Option<(u32, u32, Vec<u8>)>);

    impl ImageSource for Fake {
        fn with_image<R>(
            &mut self,
            f: impl FnOnce(RgbaImage<'_>) -> R,
        ) -> Result<Option<R>, FsError> {
            Ok(self.0.as_ref().map(|(w, h, b)| {
                f(RgbaImage {
                    width: *w,
                    height: *h,
                    bytes: b,
                })
            }))
        }
    }

    fn decode(url: &str) -> Vec<u8> {
        let b64 = url.strip_prefix("data:image/png;base64,").unwrap();
        base64::engine::general_purpose::STANDARD
            .decode(b64)
            .unwrap()
    }

    #[test]
    fn an_image_becomes_a_png_data_url_with_its_size() {
        let px = [255, 0, 0, 255, 0, 0, 255, 128].repeat(3); // 2 × 3, half transparent blue
        let img = read_image(&mut Fake(Some((2, 3, px)))).unwrap().unwrap();
        assert_eq!((img.width, img.height), (Some(2), Some(3)));
        assert_eq!(img.mime, "image/png");
        let png = decode(&img.data_url);
        assert_eq!(detect(&png), Some((ImageKind::Png, Some((2, 3)))));
        let back = Pixmap::decode_png(&png).unwrap();
        let p = back.pixel(1, 0).unwrap().demultiply();
        assert_eq!((p.blue(), p.alpha()), (255, 128));
    }

    #[derive(Default)]
    struct Sink(Option<(u32, u32, Vec<u8>)>);

    impl ImageSink for Sink {
        fn set_image(&mut self, img: RgbaImage<'_>) -> Result<(), FsError> {
            self.0 = Some((img.width, img.height, img.bytes.to_vec()));
            Ok(())
        }
    }

    #[test]
    fn copy_renders_straight_rgba_in_the_size() {
        let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect width="1" height="2" fill="#f00" fill-opacity="0.5"/></svg>"##;
        let fonts = std::sync::Arc::new(resvg::usvg::fontdb::Database::new());
        let mut sink = Sink::default();
        copy_svg(svg, 16, fonts.clone(), &mut sink).unwrap();
        let (w, h, bytes) = sink.0.unwrap();
        assert_eq!((w, h, bytes.len()), (16, 16, 16 * 16 * 4));
        // left: half transparent red, straight (not 128,0,0); right: empty
        assert_eq!(&bytes[..4], &[255, 0, 0, 128]);
        assert_eq!(bytes[15 * 4 + 3], 0);
        let mut sink = Sink::default();
        let err = copy_svg(svg, 100, fonts, &mut sink).unwrap_err();
        assert_eq!(err.code, FsErrorCode::InvalidRequest);
        assert!(sink.0.is_none());
    }

    #[test]
    fn no_image_is_none() {
        assert_eq!(read_image(&mut Fake(None)).unwrap(), None);
    }

    #[test]
    fn limits_and_broken_buffers_are_refused() {
        let code = |w: u32, h: u32, len: usize| {
            read_image(&mut Fake(Some((w, h, vec![0; len]))))
                .unwrap_err()
                .code
        };
        assert_eq!(code(0, 4, 0), FsErrorCode::InvalidImage);
        assert_eq!(code(2, 2, 15), FsErrorCode::InvalidImage);
        assert_eq!(code(MAX_SIDE + 1, 1, 0), FsErrorCode::TooLarge);
        assert_eq!(code(MAX_SIDE, MAX_SIDE, 0), FsErrorCode::TooLarge);
    }
}
