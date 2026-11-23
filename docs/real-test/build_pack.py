"""Builds pack.html (instructions, question paper, marking guide, scripts) and truth.html from scripts.json + truth.json.
Run: python build_pack.py  — then print both to PDF (see README)."""
import html, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
scripts = json.load(open(os.path.join(HERE, 'scripts.json'), encoding='utf8'))
truth = json.load(open(os.path.join(HERE, 'truth.json'), encoding='utf8'))
e = html.escape

HEAD = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{title}</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter+Tight:wght@400;500;600&family=Caveat:wght@700&display=swap" rel="stylesheet">
<style>
  @page {{ size: A4 {orient}; margin: 15mm; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; font: 10.8pt/1.45 'Inter Tight', Arial, sans-serif; color: #1F2A44; }}
  h1, h2 {{ font-family: Fraunces, Georgia, serif; margin: 0 0 3mm; line-height: 1.15; }} h1 {{ font-size: 20pt; }} h2 {{ font-size: 14pt; }}
  h3 {{ font-family: Fraunces, Georgia, serif; font-size: 12pt; margin: 4mm 0 1mm; }}
  .kicker {{ font-family: Caveat, cursive; color: #D7263D; font-size: 16pt; margin-bottom: 1mm; }}
  .page {{ break-after: page; }} .page:last-child {{ break-after: auto; }}
  ol, ul {{ margin: 2mm 0 0; padding-left: 6mm; }} li {{ margin: 1.2mm 0; }}
  .box {{ border: 1px solid #E5DECF; background: #FBF8F1; border-radius: 3mm; padding: 3mm 4mm; margin: 3mm 0; }}
  .q {{ margin: 1.8mm 0; }} .q b {{ display: inline-block; min-width: 9mm; }} .opts {{ margin-left: 9mm; color: #3a4560; }}
  .sub {{ margin-left: 9mm; }} .marks {{ float: right; color: #5A6378; font-size: 9.5pt; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 9.6pt; }} td, th {{ border: 1px solid #D9D2C3; padding: 1.4mm 1.8mm; vertical-align: top; text-align: left; }}
  th {{ background: #F3EEE2; }} .c {{ text-align: center; }} .tot {{ font-weight: 700; background: #FBF8F1; }}
  .copy {{ font-size: 12.5pt; line-height: 1.7; }} .copy .n {{ display: inline-block; min-width: 18mm; font-weight: 600; }}
  .note {{ font-size: 9.5pt; color: #5A6378; }} .warn {{ color: #D7263D; font-weight: 600; }}
</style></head><body>'''

guide_rows = [
    ('1', 'B (watt)', 1), ('2', 'C (displacement)', 1), ('3', 'B (virtual and upright)', 1), ('4', 'B (acceleration towards the centre)', 1), ('5', 'C (sound waves)', 1),
    ('6(a)', 'The rate of change of velocity (change in velocity per unit time).', 1),
    ('6(b)(i)', '4 m/s². Method (1 mark): uses a = (v − u) ÷ t.', 2),
    ('6(b)(ii)', '50 m. Method (1 mark): uses s = ½(u + v)t or s = ut + ½at².', 2),
    ('7(a)', 'Any statement with both points, 1 mark each: the current through a (metallic) conductor is directly proportional to the potential difference across it · provided the temperature (and other physical conditions) remain constant.', 2),
    ('7(b)', '2 A. Method (1 mark): total resistance 4 + 2 = 6 Ω, or I = V ÷ R with 6 Ω.', 2),
    ('8(a)', 'Any two, 1 mark each: transverse — particles vibrate perpendicular to the direction of travel, longitudinal — parallel · transverse waves have crests and troughs, longitudinal waves have compressions and rarefactions · transverse waves can be polarised, longitudinal waves cannot. Do not accept: examples of waves (e.g. "sound is longitudinal") as a difference.', 2),
    ('8(b)', '20 m/s. Method (1 mark): uses v = fλ.', 2),
    ('9', '1.0 × 10⁵ Pa (accept 100 000 Pa, 1 × 10⁵ N/m²). Method (1 mark): uses P = hρg.', 2),
    ('10', '100 J. Method (1 mark): uses PE = mgh.', 2),
]

pack = [HEAD.format(title='REDPEN WAEC Physics Test Pack', orient='')]
pack.append('''<section class="page"><div class="kicker">redpen · handwriting test · waec standard</div><h1>How to run this test</h1>
<p>This pack tests REDPEN end to end on <b>real handwriting</b> at <b>WAEC SSCE standard</b> (also first-year A-level physics): objective questions, structured questions with sub-parts like 6(b)(ii), calculations with units and standard form, method marks for wrong answers, and theory answers marked point by point. We know the correct mark for every answer, so every difference shows.</p>
<ol>
<li><b>Find 4 people</b> (different handwriting is the point). Give each person <b>one</b> script page: Script 1, 2, 3 or 4.</li>
<li>Each person copies their script <b>by hand, in pen, onto one clean exercise-book page</b>, in their normal handwriting: the question label first (1, 2 … 6(a), 6(b)(i) …), then the answer exactly as printed, mistakes included. If they run out of space, they may use small writing, but keep it to one page.</li>
<li>At the top they write only <b>“Script 1”</b> (or 2, 3, 4). No real names.</li>
<li>Photograph each page <b>flat, in good light, one page per photo</b>.</li>
<li>Put the photos in Google Drive, in a folder called <b>REDPEN real scripts</b>, and tell me.</li>
</ol>
<div class="box"><b>Then:</b> I create the assignment from the marking guide, mark all four scripts with REDPEN and compare every mark with the correct one. That run is also our demo footage.</div>
<p class="warn">Keep the separate “truth” file to yourself. Don’t give it to the writers.</p></section>''')

pack.append('''<section class="page"><div class="kicker">question paper</div><h1>Physics — WAEC standard</h1><p class="note">22 marks. Answer all questions. Show your working in Section B. Take g = 10 m/s².</p>
<h3>Section A — Objectives (1 mark each)</h3>
<div class="q"><b>1.</b> The SI unit of power is:<div class="opts">A. joule &nbsp; B. watt &nbsp; C. newton &nbsp; D. pascal</div></div>
<div class="q"><b>2.</b> Which of the following is a vector quantity?<div class="opts">A. mass &nbsp; B. speed &nbsp; C. displacement &nbsp; D. energy</div></div>
<div class="q"><b>3.</b> The image formed by a plane mirror is:<div class="opts">A. real and inverted &nbsp; B. virtual and upright &nbsp; C. real and upright &nbsp; D. virtual and inverted</div></div>
<div class="q"><b>4.</b> A body moving in a circle at constant speed has:<div class="opts">A. no acceleration &nbsp; B. an acceleration towards the centre &nbsp; C. an acceleration away from the centre &nbsp; D. a constant velocity</div></div>
<div class="q"><b>5.</b> Which of these is NOT an electromagnetic wave?<div class="opts">A. X-rays &nbsp; B. radio waves &nbsp; C. sound waves &nbsp; D. light</div></div>
<h3>Section B — Structured questions</h3>
<div class="q"><b>6.</b> (a) Define acceleration.<span class="marks">1 mark</span>
<div class="sub">(b) A car starts from rest and reaches a velocity of 20 m/s in 5 s. Calculate:<br>(i) its acceleration;<span class="marks">2 marks</span><br>(ii) the distance it covers in that time.<span class="marks">2 marks</span></div></div>
<div class="q"><b>7.</b> (a) State Ohm’s law.<span class="marks">2 marks</span><div class="sub">(b) Resistors of 4 Ω and 2 Ω are connected in series to a 12 V battery. Calculate the current in the circuit.<span class="marks">2 marks</span></div></div>
<div class="q"><b>8.</b> (a) Give two differences between transverse and longitudinal waves.<span class="marks">2 marks</span><div class="sub">(b) A wave has a frequency of 50 Hz and a wavelength of 0.4 m. Calculate its speed.<span class="marks">2 marks</span></div></div>
<div class="q"><b>9.</b> Calculate the pressure at a depth of 10 m in water. (Density of water = 1000 kg/m³.)<span class="marks">2 marks</span></div>
<div class="q"><b>10.</b> A 2 kg mass is lifted through a height of 5 m. Calculate the potential energy it gains.<span class="marks">2 marks</span></div></section>''')

rows = ''.join(f'<tr><td>{e(l)}</td><td>{e(a)}</td><td class="c">{m}</td></tr>' for l, a, m in guide_rows)
pack.append(f'''<section class="page"><div class="kicker">marking guide</div><h1>Marking guide — Physics (22 marks)</h1>
<p class="note">The correct final answer earns full marks, even without working. If the final answer is wrong, the method mark is given only when the working shown matches it. Accept any correct unit or equivalent form.</p>
<table><tr><th style="width:11%">Question</th><th>Answer</th><th style="width:9%">Marks</th></tr>{rows}</table></section>''')

for name, answers in scripts.items():
    lines = ''.join(f'<div><span class="n">{e(l)}</span>{e(a) if a else "<i class=note>(leave empty)</i>"}</div>' for l, a in answers)
    pack.append(f'''<section class="page"><div class="kicker">{e(name.lower())} — copy this by hand</div>
<h2>Write “{e(name)}” at the top of a clean exercise-book page, then copy exactly, label first:</h2><div class="copy">{lines}</div></section>''')
pack.append('</body></html>')
open(os.path.join(HERE, 'pack.html'), 'w', encoding='utf8', newline='\n').write(''.join(pack))

labels = truth['labels']
head = ''.join(f'<th class="c">{e(l)}</th>' for l in labels)
body = f'<tr><td>Out of</td>{"".join(f"<td class=c>{m}</td>" for m in truth["max"])}<td class="c tot">{truth["total"]}</td></tr>'
for name, s in truth['scripts'].items():
    body += f'<tr><td>{e(name)}</td>{"".join(f"<td class=c>{m}</td>" for m in s["marks"])}<td class="c tot">{s["total"]}</td></tr>'
notes = ''.join(f'<li><b>{e(name)}</b>: ' + '; '.join(f'{e(k)}: {e(v)}' for k, v in s['notes'].items()) + '.</li>' for name, s in truth['scripts'].items())
t = [HEAD.format(title='REDPEN WAEC Test Truth', orient='landscape'),
     f'''<div class="kicker">organiser only — do not give to writers</div><h1>Correct marks for each script</h1>
<p class="warn">What a teacher marking with the guide would give. We compare REDPEN with these numbers.</p>
<table><tr><th>Script</th>{head}<th class="c tot">Total /{truth["total"]}</th></tr>{body}</table>
<p><b>Why some marks are what they are:</b></p><ul>{notes}</ul>
<p>What this tests: objectives; sub-part labels (6(a), 6(b)(i), 6(b)(ii)); calculations with units written many ways (m/s², ms⁻², 50m, 2A, 100J, 100 joules, N/m²); standard form (1.0 × 10⁵ Pa); method marks when the answer is wrong; full marks without working; a blank; theory points with an invalid one mixed in.</p></body></html>''']
open(os.path.join(HERE, 'truth.html'), 'w', encoding='utf8', newline='\n').write(''.join(t))
print('built pack.html and truth.html')
