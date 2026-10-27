# SVG-Transform-Logik bei verschachtelten Elementen (Deutsch)

Dieser Leitfaden erklärt, wie die Transformationslogik (translate, scale, rotate, matrix, skew) beim Parsen von SVG in diesem Projekt funktioniert – insbesondere bei verschachtelten <g>-Gruppen und deren Kindern – und wie die endgültigen Positionen im Modell ankommen.

Kurzzusammenfassung

- Jede SVG-Node (z. B. SVGGroup, SVGText, SVGRect, …) besitzt eine eigene lokale Transform-Matrix (CGAffineTransform) im Feld `transform`.
- Der Parser liest die `transform`-Attribute der jeweiligen Elemente und wandelt sie in eine affine Transformationsmatrix um.
- Verschachtelte Gruppen: Die effektive (weltweite) Transformation eines Kindes ergibt sich aus der Verkettung seiner lokalen Matrix mit der (komponierten) aller Vorfahren. Auf Punkte angewendet: „erst Kind, dann Eltern“.
- In der UI (SwiftUI) werden die Transforms automatisch hierarchisch angewandt, d. h. Eltern-Transforms „umhüllen“ die Kinder.

Wesentliche Code-Stellen

1. Parsen der Transformationsliste

- Datei: `Packages/SVGParser/Sources/SVGParser/SVG/SVGTransformParsing.swift`
  - `SVGHelper.parseTransformString(_:)`: Zerlegt einen transform-String in eine geordnete Liste von Befehlen (translate, scale, rotate[,cx,cy], skewX, skewY, matrix).
  - `SVGHelper.applyTransforms(_:startingWith:)`: Baut aus dieser Liste eine einzelne CGAffineTransform – die Befehle werden gemäß SVG-Spezifikation rechts→links angewendet (die zuletzt notierte Funktion wirkt zuerst). Beispiel: `translate(10,20) scale(2,3)` bedeutet: zuerst skalieren, dann verschieben.

- Regex-Helfer: `SVGConstants.swift` (Klasse `SVGParserRegexHelper`)
  - `transformAttributePattern` und `transformPattern` sorgen dafür, dass alle numerischen Werte (inkl. Exponentialschreibweise) korrekt ausgelesen werden.

2. Anwendung auf Nodes

- Datei: `Packages/SVGParser/Sources/SVGParser/SVG/Elements/SVGElementParser.swift`
  - In `SVGBaseElementParser.parse(...)` wird nach dem Parsen des eigentlichen Knotens das Attribut `transform` gelesen und die resultierende Matrix dem Node hinzugefügt:
    `node.transform = node.transform.concatenating(transform)`
  - Wichtig: Bei `SVGText` (siehe unten) ist `node.transform` zuvor bereits die `x/y`-Verschiebung – diese wird also VOR dem Attribut-Transform angewendet.

- Datei: `Packages/SVGParser/Sources/SVGParser/SVG/Elements/SVGTextParser.swift`
  - Text erhält die lokale Verschiebung aus `x`/`y` als Transform: `CGAffineTransform(translationX: x, y: y)`.
  - Danach wird – wie oben – das `transform`-Attribut (falls vorhanden) rechts angekettet.

3. Hierarchische Zusammensetzung (Verschachtelung)

- Jede Gruppe (`SVGGroup`) besitzt eine eigene `transform`-Matrix. In der Laufzeitdarstellung (SwiftUI) werden die Effekte automatisch verschachtelt: Die Eltern-Transformation wirkt auf alle Kinder mit.
- Mathematisch bedeutet das für einen lokalen Punkt p eines Kindknotens:
  - Weltpunkt = p • T_kind • T_eltern • T_großeltern • ...
  - In CoreGraphics bedeutet `A.concatenating(B)`: wende zuerst A an, dann B (wenn auf Punkte angewandt). Daher ergibt sich im Traversal typischerweise `current = local.concatenating(parent)`.

Beispielprüfung per Test

- Datei: `AppIconic/AppIconicTests/SVGPositionCalculationTests.swift`
  - Der Test traversiert den Baum Tiefen-zuerst und führt eine Kumulierung durch:
    `current = group.transform.concatenating(parentTransform)`
  - Für jeden `<text>`-Knoten wird `CGPoint.zero.applying(current)` als Weltposition genommen (im Test stehen `x/y=0`).
  - So wird geprüft, dass die Endkoordinaten mit den erwarteten (im Textinhalt kodierten) Positionen übereinstimmen.

Unterstützte Befehle und ihre Umsetzung

- translate(tx, ty): `CGAffineTransform(translationX: tx, y: ty)`
- scale(sx[, sy]): `CGAffineTransform(scaleX: sx, y: sy)`; fehlt `sy`, wird `sy = sx` verwendet.
- rotate(a[, cx, cy]): Rotation um 0/0 oder mit Pivot (cx,cy). Implementiert als
  `T(-cx,-cy) • R(a) • T(cx,cy)`
- matrix(a,b,c,d,tx,ty): Direkt als `CGAffineTransform(a: a, b: b, c: c, d: d, tx: tx, ty: ty)`
- skewX(ax), skewY(ay): Über Tangens des Winkels als Scher-Matrix.

Wie kommen die endgültigen Positionen ins Modell?

- Das Modell (AppIconicCore) hält pro Node nur die LOKALE Transform (`SVGNode.transform`).
- Die endgültige (globale) Position eines grafischen Elements ergibt sich zur Laufzeit durch die Komposition aller Vorfahren-Transforms mit der lokalen Transform des Knotens (siehe oben).
- In SwiftUI wird das über `.transformEffect(model.transform)` in den jeweiligen Views umgesetzt (z. B. `SVGTextView`, `SVGGroupView`). Platziert man ein Kind in eine Gruppe, deren View bereits transformiert ist, wird die Eltern-Transform automatisch auf das Kind angewandt.
- Falls man die absoluten Koordinaten programmatisch benötigt, kann man – wie im Test – beim Traversieren die Transform-Matrizen zusammenfalten und einen lokalen Referenzpunkt (z. B. (0,0) oder den Mittelpunkt/Baseline) mit der kumulierten Matrix transformieren.

Praktische Hinweise

- Reihenfolge zählt: `translate` gefolgt von `scale` skaliert auch die zuvor erfolgte Verschiebung.
- Gruppentransforms beeinflussen sämtliche Kinder (auch deren Übersetzungen und Pfade).
- Bei `rotate(angle, cx, cy)` wird korrekt um das angegebene Pivot gedreht (durch Vor-/Nach-Translation um das Pivot).

Relevante Klassen/Dateien

- Parser-Einstieg: `SVGParser.parse(...)`
- Transform-Parsing: `SVGTransformParsing.swift`, `SVGParserPrimitives.parseTransform(...)`
- Regex-Helfer: `SVGConstants.swift` (Klasse `SVGParserRegexHelper`)
- Elemente: `SVGStructureParsers.swift` (SVGViewportParser, SVGGroupParser), `SVGTextParser.swift`
- Modell: `AppIconicCore/Models/SVGNode.swift`, `SVGGroup.swift`, `SVGText.swift`
- Tests/Beispiele: `AppIconic/AppIconicTests/SVGPositionCalculationTests.swift`, `TransformCommandTests.swift`, `test_transform_parsing.swift`

Damit ist ersichtlich, wie verschachtelte `transform`-Attribute in die endgültigen Weltpositionen überführt werden und wie diese im Modell bzw. in der UI zur Anwendung kommen.
