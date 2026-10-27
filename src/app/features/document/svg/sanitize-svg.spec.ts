import { SVG_FIXTURES } from '../../../../testing/fixtures/svg-fixtures';
import { parseSvg, serializeAsset } from './node-ids';
import { sanitizeSvg } from './sanitize-svg';

const S = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"';

function clean(markup: string) {
  const svg = parseSvg(`<svg ${S}>${markup}</svg>`)!;
  const found = sanitizeSvg(svg.root);
  return { found, out: serializeAsset(svg) };
}

describe('sanitizeSvg', () => {
  it.each([
    ['<script>alert(1)</script><rect/>', 'script'],
    ['<script xlink:href="http://x/a.js"/>', 'script'],
    ['<rect onclick="alert(1)" ONLOAD="x()"/>', 'handler'],
    [
      '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>',
      'foreign_object',
    ],
    ['<image href="https://evil.example/t.png"/>', 'external_ref'],
    ['<use xlink:href="other.svg#a"/>', 'external_ref'],
    ['<a href="javascript:alert(1)"><rect/></a>', 'script'],
    ['<rect fill="url(https://x/p.svg#g)"/>', 'external_ref'],
    ['<rect style="fill:url(//x/y)"/>', 'external_ref'],
    ['<style>@import url(https://x/a.css);</style>', 'style'],
    ['<style>rect{fill:url(https://x)}</style>', 'style'],
    ['<set attributeName="href" to="javascript:alert(1)"/>', 'script'],
    ['<animate attributeName="onbegin" values="x"/>', 'script'],
    ['<iframe src="https://x"/>', 'script'],
    // prompt 031
    ['<html:div xmlns:html="http://www.w3.org/1999/xhtml">evil</html:div>', 'foreign_object'],
    ['<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>evil</mi></math>', 'foreign_object'],
    ['<rect style="fill:image-set(\'https://evil/x.png\' 1x)"/>', 'external_ref'],
    ['<rect style="fill:-webkit-image-set(\'//evil\' 1x)"/>', 'external_ref'],
    ['<style>rect{fill:\\75 rl(https://evil)}</style>', 'style'],
    ['<style>rect{background:src("https://evil")}</style>', 'style'],
    ['<g xml:base="https://evil/"><rect/></g>', 'external_ref'],
    ['<set attributeName=" href " to="https://evil"/>', 'script'],
    ['<set attributeName="style" to="fill:url(https://evil)"/>', 'script'],
  ])('removes %s', (markup, kind) => {
    const { found, out } = clean(markup);
    expect(found).toContain(kind);
    expect(out).not.toMatch(
      /alert|evil|other\.svg|onclick|onload|foreignObject|iframe|a\.css|\/\/x[/)]/i,
    );
  });

  it('keeps fragment links, embedded images and harmless styles', () => {
    const markup =
      '<defs><linearGradient id="g"/></defs><rect fill="url(#g)" style="fill:url(\'#g\')"/>' +
      '<use href="#g"/><image xlink:href="data:image/png;base64,AAAA"/><style>.a{fill:red}</style>' +
      '<set attributeName="opacity" to="0"/>';
    const { found, out } = clean(markup);
    expect(found).toEqual([]);
    expect(out).toContain('url(#g)');
    expect(out).toContain('href="#g"');
    expect(out).toContain('data:image/png');
    expect(out).toContain('.a{fill:red}');
    expect(out).toContain('<set');
  });

  /** Two legacy fixtures do contain what we remove: fonts loaded from files, HTML content. */
  const EXPECTED: Record<string, string[]> = {
    '_logo-artv.svg': ['style'],
    'demo-elemente.svg': ['foreign_object'],
  };

  it.each(SVG_FIXTURES.map((f) => [f.name, f.text]))('cleans the fixture %s', (name, text) => {
    const svg = parseSvg(text)!;
    const before = serializeAsset(svg);
    expect(sanitizeSvg(svg.root)).toEqual(EXPECTED[name] ?? []);
    if (!EXPECTED[name]) expect(serializeAsset(svg)).toBe(before);
  });
});
