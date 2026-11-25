# Four handwritten WAEC physics scripts, photographed on a phone

Real handwriting in pen on paper and in exercise books, answering the WAEC-standard physics paper in
[`docs/real-test/`](../../docs/real-test/). Photographed on a phone as a teacher would: one page sideways
(Script 3), one script over two exercise-book pages (Script 4), one written on loose paper.
A student name on Script 1 is blurred.

| Script | Photos | Examiner's mark | What makes it hard |
|---|---|---|---|
| 1 | `script-1.png` | 20/22 | Ohm's law without its condition (1 of 2); "10 × 10⁵ Pa" is the wrong answer with the right working (method mark only) |
| 2 | `script-2.png` | 6/22 | Wrong formulas with tidy arithmetic (no method marks); "P = hρg = 10 × 1000 × 1" is the right formula with one wrong value (method mark); a fraction written as one number over another |
| 3 | `script-3.png` | 17/22 | Photographed sideways; 6(b)(ii) left blank; "4" with no unit or working (full marks) |
| 4 | `script-4-page-1.png`, `script-4-page-2.png` | 22/22 | Two pages, with 8(a) running onto the second; a ÷ written without its dots, so it looks like + |

The examiner's marks per question, with a note wherever the handwriting differs from the typed pack, are in
[`docs/real-test/handwritten-truth.json`](../../docs/real-test/handwritten-truth.json). Run them against the live app:

```bash
cd web
REDPEN_CODE=<access code> TRUTH=../docs/real-test/handwritten-truth.json node e2e/handwriting-test.mjs ../samples/waec-handwritten
```
