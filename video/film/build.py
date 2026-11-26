"""Writes the InkTally demo film (index.html + compositions/) from one beat list.

The voice is the clock: each beat lasts LEAD + its narration + TAIL. Footage beats take the named scenes of the
live-site recording (assets/footage/web.mp4 + markers.json), cut out the AI waits (keeping the moment each result
lands), and retime what is left to fill the beat. Click, key and pop sounds come from the recorder's log. Run:
python build.py
"""
import html
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent
VOICE = ROOT.parent / "voice"
FPS = 30
FRAME = 1 / FPS
LEAD, TAIL = 0.45, 0.65
W, H = 1920, 1080
MAX_RATE = 3.2          # faster than this reads as a glitch: trim the footage instead
WAIT_KEEP = 0.8         # seconds of each AI wait kept, so the spinner is seen before the result
SFX_PEAK = {"click-a": 0.073, "click-b": 0.067, "click-c": 0.078, "key": 0.054, "pop": 0.12, "stamp": 0.162, "riser": 1.986}

# Screen frame for landscape footage (web, Nano): right of the headline column.
FX, FY, FW = 600, 116, 1240
FH = round(FW * 9 / 16)
# Phone frame for Android footage.
PH_H = 900

lines = {l["id"]: l for l in json.loads((VOICE / "lines.json").read_text(encoding="utf-8"))}
markers = json.loads((ROOT / "assets/footage/markers.json").read_text(encoding="utf-8"))
stats = json.loads((ROOT / "assets/stats.json").read_text(encoding="utf-8"))
android = json.loads((ROOT / "assets/footage/android.json").read_text(encoding="utf-8")) if (ROOT / "assets/footage/android.json").exists() else None


def duration(path: Path) -> float:
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)])
    return float(out.decode().strip())


scenes = [m for m in markers if m["kind"] in ("scene", "error")]


def scene_span(name: str) -> tuple[float, float]:
    i = next(i for i, m in enumerate(scenes) if m["name"] == name)
    return scenes[i]["t"], scenes[i + 1]["t"]


def intervals(names: list[str]) -> list[tuple[float, float]]:
    """The scenes' footage with each AI wait cut down to its last WAIT_KEEP seconds."""
    out = []
    for name in names:
        a, b = scene_span(name)
        cur = a
        waits = [m for m in markers if m["kind"] == "wait-start" and a <= m["t"] < b]
        for w in waits:
            end = next(m["t"] for m in markers if m["kind"] == "wait-end" and m["name"] == w["name"] and m["t"] >= w["t"])
            if w["t"] - cur > 0.3:
                out.append((cur, w["t"]))
            cur = max(w["t"], end - WAIT_KEEP)
        if b - cur > 0.3:
            out.append((cur, b))
    return out


def fit(ivs: list[tuple[float, float]], window: float) -> list[tuple[float, float]]:
    """Trim each interval's start (keeping its end, where results land) until the footage fits at MAX_RATE."""
    total = sum(b - a for a, b in ivs)
    need = window * MAX_RATE
    if total <= need:
        return ivs
    keep = need / total
    return [(b - (b - a) * keep, b) for a, b in ivs]


# ---------------------------------------------------------------- beats
BEATS = [
    {"id": "s01-hook", "kind": "card", "card": "hook"},
    {"id": "s02-idea", "kind": "card", "card": "idea"},
    {"id": "s03-quick", "kind": "web", "scenes": ["quick-mark"], "eyebrow": "Quick mark", "headline": "One photo.<br>Marked.", "sub": "The key comes from the questions, never from the student’s answers."},
    {"id": "s04-waec", "kind": "web", "scenes": ["waec-key"], "eyebrow": "Real exam papers", "headline": "Your own<br>marking guide", "sub": "A WAEC physics paper: labels, marks, method marks, copied exactly."},
    {"id": "s05-script2", "kind": "web", "scenes": ["script-2"], "eyebrow": "Real handwriting", "headline": "Marked like<br>the examiner", "sub": "Wrong formula, tidy arithmetic: no method mark, flagged.", "payoff": "Script 2-marked"},
    {"id": "s06-messy", "kind": "web", "scenes": ["script-3-sideways", "script-4-two-pages"], "eyebrow": "Real exercise books", "headline": "Sideways.<br>Two pages.", "sub": "Turned upright on the phone; two pages, one student."},
    {"id": "s07-offline", "kind": "web", "scenes": ["offline"], "eyebrow": "No signal", "headline": "Saved, then<br>marked", "sub": "The photo waits on the phone and is marked when the signal is back."},
    {"id": "s08-nano", "kind": "nano", "eyebrow": "Gemini Nano, on the device", "headline": "Offline.<br>Then verified.", "sub": "Real Gemini Nano run on the live site, recorded 15 Nov, before the app was renamed InkTally."},
    {"id": "s09-tools", "kind": "web", "scenes": ["review", "register", "key-edit", "insights"], "eyebrow": "For the teacher", "headline": "Review, register,<br>re-mark", "sub": "Excel, an editable key, catch-up sheets from real mistakes."},
    {"id": "s10-sheet", "kind": "web", "scenes": ["printed-sheet"], "eyebrow": "Printed sheets", "headline": "Names stay<br>on the phone", "sub": "Only the cut-out answer boxes are read."},
    {"id": "s11-private", "kind": "web", "scenes": ["private-mode"], "eyebrow": "Private mode", "headline": "No pupil’s work<br>to cloud AI", "sub": "Enforced by a network guard. The teacher chooses."},
    {"id": "s12-android", "kind": "android", "eyebrow": "Android", "headline": "Same app.<br>Same data.", "sub": "Gemini Nano on supported phones; the cloud everywhere else."},
    {"id": "s13-proof", "kind": "card", "card": "proof"},
    {"id": "s14-end", "kind": "card", "card": "end"},
]
if android is None:
    BEATS = [b for b in BEATS if b["kind"] != "android"]

t = 0.0
for b in BEATS:
    b["voice"] = duration(ROOT / f"assets/voice/{b['id']}.wav")
    b["start"] = round(t, 3)
    b["dur"] = round(LEAD + b["voice"] + TAIL, 3)
    t += b["dur"]
TOTAL = round(t, 3)

# ---------------------------------------------------------------- footage, sounds
videos, sounds = [], []
take = 0


def add_sound(name: str, at: float, volume: float) -> None:
    """Place a sound so its peak lands one frame after `at` (absolute seconds)."""
    sounds.append({"name": name, "start": round(max(0.0, at - SFX_PEAK[name] + FRAME), 3), "volume": volume})


for b in BEATS:
    if b["kind"] == "web":
        ivs = fit(intervals(b["scenes"]), b["dur"])
        total = sum(e - s for s, e in ivs)
        rate = total / b["dur"]
        cursor = b["start"]
        for i, (m0, m1) in enumerate(ivs):
            seg_dur = (m1 - m0) / rate
            videos.append({"id": f"v-{b['id']}-{i}", "src": "web.mp4", "start": round(cursor, 3), "dur": round(seg_dur, 3), "media": round(m0, 3), "rate": round(rate, 4), "frame": "screen"})
            for m in markers:
                if not (m0 <= m["t"] < m1):
                    continue
                at = cursor + (m["t"] - m0) / rate
                if m["kind"] == "click":
                    add_sound(["click-a", "click-b", "click-c"][take % 3], at, 0.85); take += 1
                elif m["kind"] == "typing":
                    for c in range(0, m.get("chars", 0), 3):
                        add_sound("key", at + 0.3 / rate + c * 0.045 / rate, 0.45)
                elif m["kind"] == "wait-end":
                    add_sound("pop", at, 0.7)
                    if b.get("payoff") == m["name"]:
                        add_sound("riser", at, 0.5)
            cursor += seg_dur
    elif b["kind"] == "nano":
        # Real Gemini Nano run on the live site (bench/evidence/ondevice-current-2026-11-15): offline marking, reconnect, cloud check.
        m0, m1 = stats["nano"]["from"], stats["nano"]["to"]
        rate = (m1 - m0) / b["dur"]
        videos.append({"id": f"v-{b['id']}", "src": "nano.mp4", "start": b["start"], "dur": b["dur"], "media": m0, "rate": round(rate, 4), "frame": "screen"})
    elif b["kind"] == "android":
        fitted = fit([(s["from"], s["to"]) for s in android["segments"]], b["dur"])
        segs = [{"src": s["src"], "from": round(a, 3), "to": e} for s, (a, e) in zip(android["segments"], fitted)]
        total = sum(s["to"] - s["from"] for s in segs)
        rate = total / b["dur"]
        cursor = b["start"]
        for i, s in enumerate(segs):
            seg_dur = (s["to"] - s["from"]) / rate
            videos.append({"id": f"v-{b['id']}-{i}", "src": s["src"], "start": round(cursor, 3), "dur": round(seg_dur, 3), "media": s["from"], "rate": round(rate, 4), "frame": "phone"})
            cursor += seg_dur

for v in videos:
    assert 0.1 <= v["rate"] <= MAX_RATE + 0.01, (v["id"], v["rate"])


# ---------------------------------------------------------------- captions
def caption_groups() -> list[dict]:
    """At most 8 words per chunk, timed by characters across the beat's voice; a 1-2 word tail joins the chunk before."""
    groups = []
    for b in BEATS:
        words = lines[b["id"]]["caption"].split()
        chunks, cur = [], []
        for w in words:
            cur.append(w)
            if len(cur) >= 8 or re.search(r"[.?!:]$", w):
                chunks.append(cur); cur = []
        if cur:
            if len(cur) <= 2 and chunks:
                chunks[-1] += cur
            else:
                chunks.append(cur)
        total_chars = sum(len(" ".join(c)) for c in chunks)
        at = b["start"] + LEAD
        for c in chunks:
            d = b["voice"] * len(" ".join(c)) / total_chars
            groups.append({"text": " ".join(c), "start": round(at, 3), "end": round(at + d - 0.04, 3), "left": b["kind"] != "card"})
            at += d
    return groups


# ---------------------------------------------------------------- compositions
STYLE_BASE = """
#root { position: absolute; inset: 0; color: #FBF8F1; font-family: 'Inter', sans-serif; }
.eyebrow { font-weight: 700; font-size: 24px; letter-spacing: 0.14em; text-transform: uppercase; color: #FF7A8A; }
.display { font-family: 'Fraunces', Georgia, serif; font-weight: 600; letter-spacing: -0.01em; line-height: 1.02; }
.sub { font-size: 30px; line-height: 1.38; color: rgba(251, 248, 241, 0.82); }
.src { font-size: 20px; color: rgba(251, 248, 241, 0.6); }
.red { color: #FF5A6E; }
"""


def scene(cid: str, style: str, body: str, js: str) -> str:
    return f"""<template>
  <style>{STYLE_BASE}{style}</style>
  <div id="root" data-composition-id="{cid}" data-width="{W}" data-height="{H}">
{body}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
{js}
    window.__timelines["{cid}"] = tl;
  </script>
</template>
"""


def rise(sel: str, at: float, y: int = 40, d: float = 0.5) -> str:
    return f'    tl.fromTo("{sel}", {{ opacity: 0, y: {y} }}, {{ opacity: 1, y: 0, duration: {d}, ease: "power3.out" }}, {at:.3f});\n'


def out(sel: str, at: float) -> str:
    return f'    tl.to("{sel}", {{ opacity: 0, duration: 0.3, ease: "power2.in" }}, {at:.3f});\n'


def panel_scene(b: dict) -> str:
    cid = b["id"]
    body = f"""    <div id="{cid}-panel" class="clip" data-start="0" data-duration="{b['dur']}" style="position:absolute; left:90px; top:0; width:470px; height:{H}px; display:flex; flex-direction:column; justify-content:center; gap:24px;">
      <div id="{cid}-eyebrow" class="eyebrow">{html.escape(b['eyebrow'])}</div>
      <div id="{cid}-headline" class="display" style="font-size:78px;">{b['headline']}</div>
      <div id="{cid}-sub" class="sub">{html.escape(b['sub'])}</div>
    </div>"""
    js = rise(f"#{cid}-eyebrow", 0.1, 20) + rise(f"#{cid}-headline", 0.22, 50, 0.6) + rise(f"#{cid}-sub", 0.5, 24) + out(f"#{cid}-panel", b["dur"] - 0.32)
    return scene(cid, "", body, js)


def card_scene(b: dict) -> str:
    cid, d, kind = b["id"], b["dur"], b["card"]
    if kind == "hook":
        imgs = ["script-2.png", "script-3.png", "script-4-page-1.png", "script-1.png"]
        pics = "\n".join(
            f'      <img id="{cid}-p{i}" src="assets/img/{f}" alt="" style="position:absolute; left:{1010 + i * 150}px; top:{150 + (i % 2) * 70}px; width:{460 if f != "script-3.png" else 560}px; border-radius:10px; box-shadow:0 30px 70px -20px rgba(0,0,0,0.6); transform:rotate({[-7, 4, -3, 6][i]}deg);" />'
            for i, f in enumerate(imgs)
        )
        texts = [("One teacher.", 0.2), ("Eighty handwritten scripts.", 1.3), ("Data that comes and goes.", 3.0), ("Marking takes the night.", 4.7)]
        tx = "\n".join(f'      <div id="{cid}-t{i}" class="display" style="font-size:{78 if i else 96}px;{" color:#FF5A6E;" if i == 3 else ""}">{html.escape(s)}</div>' for i, (s, _) in enumerate(texts))
        body = f"""    <div id="{cid}-wrap" class="clip" data-start="0" data-duration="{d}" data-layout-allow-overlap data-layout-allow-overflow style="position:absolute; inset:0;">
{pics}
      <div style="position:absolute; left:110px; top:0; width:880px; height:{H}px; display:flex; flex-direction:column; justify-content:center; gap:18px;">
{tx}
      </div>
    </div>"""
        js = "".join(f'    tl.fromTo("#{cid}-p{i}", {{ opacity: 0, y: 90 }}, {{ opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }}, {0.3 + i * 0.35:.2f});\n' for i in range(4))
        js += "".join(rise(f"#{cid}-t{i}", LEAD + at, 36) for i, (_, at) in enumerate(texts)) + out(f"#{cid}-wrap", d - 0.32)
    elif kind == "idea":
        steps = [("1", "Gemini Nano reads", "each answer, on the device, offline"), ("2", "Code marks", "against the teacher’s own marking guide"), ("3", "The cloud checks", "every mark when the signal is back")]
        cells = "\n".join(
            f'      <div id="{cid}-s{i}" style="width:500px; padding:44px; border-radius:24px; background:rgba(255,255,255,0.06); border:2px solid rgba(255,255,255,0.12); display:flex; flex-direction:column; gap:14px;"><div class="display red" style="font-size:96px;">{n}</div><div class="display" style="font-size:52px;">{h}</div><div class="sub">{s}</div></div>'
            for i, (n, h, s) in enumerate(steps)
        )
        body = f"""    <div id="{cid}-wrap" class="clip" data-start="0" data-duration="{d}" style="position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:56px;">
      <div id="{cid}-title" class="display" style="font-size:92px;">Ink<span class="red">Tally</span></div>
      <div style="display:flex; gap:44px;">
{cells}
      </div>
    </div>"""
        js = rise(f"#{cid}-title", 0.1, 30) + "".join(rise(f"#{cid}-s{i}", LEAD + b["voice"] * (0.32 + i * 0.22), 50) for i in range(3)) + out(f"#{cid}-wrap", d - 0.32)
    elif kind == "proof":
        rows = stats["proof"]
        cells = "\n".join(
            f'      <div id="{cid}-r{i}" style="display:flex; flex-direction:column; gap:10px; width:520px;"><div class="display red" style="font-size:96px;">{html.escape(r["value"])}</div><div class="sub" style="font-size:28px;">{html.escape(r["label"])}</div></div>'
            for i, r in enumerate(rows)
        )
        body = f"""    <div id="{cid}-wrap" class="clip" data-start="0" data-duration="{d}" style="position:absolute; left:150px; right:150px; top:0; height:{H}px; display:flex; flex-direction:column; justify-content:center; gap:54px;">
      <div class="eyebrow">Measured · every number re-checked against its evidence file</div>
      <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:56px 60px;">
{cells}
      </div>
    </div>"""
        js = "".join(rise(f"#{cid}-r{i}", 0.3 + i * 0.45, 30) for i in range(len(rows))) + out(f"#{cid}-wrap", d - 0.32)
    else:  # end card
        body = f"""    <div id="{cid}-wrap" class="clip" data-start="0" data-duration="{d}" style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:28px; text-align:center;">
      <img id="{cid}-logo" src="assets/img/logo.png" style="width:150px; height:150px; border-radius:34px;" alt="" />
      <div id="{cid}-name" class="display" style="font-size:150px;">Ink<span class="red">Tally</span></div>
      <div id="{cid}-tag" class="display" style="font-size:64px;">Photograph the page. It’s marked.</div>
      <div id="{cid}-url" class="src" style="font-size:30px; color:rgba(251,248,241,0.85);">inktally.web.app · github.com/egbujor-emmanuel/inktally · Firebase AI Logic</div>
    </div>"""
        js = rise(f"#{cid}-logo", 0.1, 20) + rise(f"#{cid}-name", 0.25, 30) + rise(f"#{cid}-tag", LEAD + 0.9, 30) + rise(f"#{cid}-url", 1.6, 16)
    return scene(cid, "", body, js)


def captions_scene(groups: list[dict]) -> str:
    items, js = [], []
    for i, g in enumerate(groups):
        side = " cap-right" if g.get("left") else ""
        items.append(f'    <div id="cap{i}" class="clip cap{side}" data-start="{g["start"]}" data-duration="{round(g["end"] - g["start"], 3)}"><span id="cap{i}-t">{html.escape(g["text"])}</span></div>')
        js.append(f'    tl.fromTo("#cap{i}-t", {{ opacity: 0, y: 8 }}, {{ opacity: 1, y: 0, duration: 0.12, ease: "power2.out" }}, {g["start"]});')
        js.append(f'    tl.to("#cap{i}-t", {{ opacity: 0, duration: 0.1, ease: "power2.in" }}, {round(g["end"] - 0.1, 3)});')
    style = (".cap { position: absolute; left: 0; right: 0; bottom: 70px; text-align: center; overflow: visible; }"
             f" .cap-right {{ left: {FX}px; width: {FW}px; right: auto; bottom: 60px; }}"
             " .cap span { display: inline-block; font-family: 'Inter', sans-serif; font-weight: 700; font-size: 44px; line-height: 1.2; color: #FBF8F1; padding: 8px 22px; border-radius: 14px; background: rgba(15, 22, 40, 0.78); }")
    return scene("captions", style, "\n".join(items), "\n".join(js))


# ---------------------------------------------------------------- write
comp = ROOT / "compositions"
comp.mkdir(exist_ok=True)
for old in comp.glob("*.html"):
    old.unlink()
hosts = []
for z, b in enumerate(BEATS, start=10):
    (comp / f"{b['id']}.html").write_text(card_scene(b) if b["kind"] == "card" else panel_scene(b), encoding="utf-8")
    hosts.append(f'      <div id="{b["id"]}" data-composition-id="{b["id"]}" data-composition-src="compositions/{b["id"]}.html" data-start="{b["start"]}" data-duration="{b["dur"]}" data-track-index="1" data-track-kind="graphics" data-width="{W}" data-height="{H}" style="z-index:{z};"></div>')
groups = caption_groups()
(comp / "captions.html").write_text(captions_scene(groups), encoding="utf-8")

# Screen frame (web + Nano) and phone frame (Android): each fades in for its beats, footage at root level.
screen_beats = [b for b in BEATS if b["kind"] in ("web", "nano")]
phone_beats = [b for b in BEATS if b["kind"] == "android"]


def frame_spans(beats: list[dict]) -> list[tuple[float, float]]:
    spans = []
    for b in beats:
        s, e = b["start"], b["start"] + b["dur"]
        if spans and abs(spans[-1][1] - s) < 0.01:
            spans[-1] = (spans[-1][0], e)
        else:
            spans.append((s, e))
    return spans


screen_videos = "\n".join(
    f'          <video id="{v["id"]}" class="clip" src="assets/footage/{v["src"]}" muted playsinline data-start="{v["start"]}" data-duration="{v["dur"]}" data-media-start="{v["media"]}" data-playback-rate="{v["rate"]}" data-track-index="3" style="position:absolute; inset:0; width:{FW}px; height:{FH}px; object-fit:{"contain" if v["src"] == "nano.mp4" else "cover"}; background:#0f1628;"></video>'
    for v in videos if v["frame"] == "screen"
)
phone_w = round(PH_H * 9 / 19.5)
phone_videos = "\n".join(
    f'          <video id="{v["id"]}" class="clip" src="assets/footage/{v["src"]}" muted playsinline data-start="{v["start"]}" data-duration="{v["dur"]}" data-media-start="{v["media"]}" data-playback-rate="{v["rate"]}" data-track-index="3" style="position:absolute; inset:0; width:{phone_w}px; height:{PH_H}px; object-fit:cover;"></video>'
    for v in videos if v["frame"] == "phone"
)
rigs = f"""      <div id="screen" style="position:absolute; left:{FX}px; top:{FY}px; width:{FW}px; height:{FH + 44}px; z-index:40; opacity:0; border-radius:18px; background:#1b2540; box-shadow:0 50px 110px -40px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.08);">
        <div style="position:absolute; left:20px; top:15px; display:flex; gap:9px;"><div style="width:14px;height:14px;border-radius:7px;background:#ff5f57;"></div><div style="width:14px;height:14px;border-radius:7px;background:#febc2e;"></div><div style="width:14px;height:14px;border-radius:7px;background:#28c840;"></div></div>
        <div style="position:absolute; left:110px; top:9px; width:520px; height:26px; border-radius:13px; background:rgba(255,255,255,0.08); font-size:16px; line-height:26px; padding-left:16px; color:rgba(251,248,241,0.7); font-family:'Inter',sans-serif;">inktally.web.app</div>
        <div id="screen-mask" style="position:absolute; left:0; top:44px; width:{FW}px; height:{FH}px; border-radius:0 0 18px 18px; overflow:hidden;">
{screen_videos}
        </div>
      </div>
      <div id="phone" style="position:absolute; left:{FX + FW // 2 - phone_w // 2 - 14}px; top:{(H - PH_H) // 2 - 50}px; width:{phone_w + 28}px; height:{PH_H + 28}px; z-index:41; opacity:0; border-radius:54px; background:#0b1020; box-shadow:0 0 0 2px rgba(255,255,255,0.12), 0 40px 90px -30px rgba(0,0,0,0.7);">
        <div style="position:absolute; left:14px; top:14px; width:{phone_w}px; height:{PH_H}px; border-radius:42px; overflow:hidden;">
{phone_videos}
        </div>
      </div>"""
rig_js = []
for sel, beats in (("#screen", screen_beats), ("#phone", phone_beats)):
    for s, e in frame_spans(beats):
        rig_js.append(f'      tl.fromTo("{sel}", {{ opacity: 0, y: 50 }}, {{ opacity: 1, y: 0, duration: 0.55, ease: "power3.out" }}, {s:.3f});')
        rig_js.append(f'      tl.to("{sel}", {{ opacity: 0, duration: 0.35, ease: "power2.in" }}, {e - 0.35:.3f});')

SFX_LEN = {n: duration(ROOT / f"assets/sfx/{n}.mp3") for n in SFX_PEAK}
voice_tags = "\n".join(f'      <audio id="vo-{b["id"]}" src="assets/voice/{b["id"]}.wav" data-start="{round(b["start"] + LEAD, 3)}" data-duration="{round(b["voice"], 3)}" data-track-index="5" data-volume="1"></audio>' for b in BEATS)
sfx_tags = "\n".join(
    f'      <audio id="fx{i}" src="assets/sfx/{s["name"]}.mp3" data-start="{s["start"]}" data-duration="{round(min(SFX_LEN[s["name"]], TOTAL - s["start"]), 3)}" data-track-index="{7 + i % 2}" data-volume="{s["volume"]}"></audio>'
    for i, s in enumerate(sounds)
)

index = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    <script src="assets/gsap.min.js"></script>
    <style>
      @font-face {{ font-family: 'Fraunces'; src: url('assets/fonts/Fraunces.ttf'); font-weight: 100 900; }}
      @font-face {{ font-family: 'Inter'; src: url('assets/fonts/Inter.ttf'); font-weight: 100 900; }}
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ margin: 0; width: {W}px; height: {H}px; overflow: hidden; background: #0f1628; }}
      #root {{ width: 100%; height: 100%; position: relative; }}
      #bg {{ position: absolute; inset: 0; background: radial-gradient(1200px 760px at 72% 35%, #26355c 0%, #172240 48%, #0f1628 100%); }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="{W}" data-height="{H}">
      <div id="bg"></div>
{chr(10).join(hosts)}
{rigs}
      <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="{TOTAL}" data-track-index="4" data-track-kind="captions" data-width="{W}" data-height="{H}" style="z-index:60;"></div>
{voice_tags}
      <audio id="bed" src="assets/audio/bed.wav" data-start="0" data-duration="{TOTAL}" data-track-index="6" data-volume="0.14" data-fade-in="1" data-fade-out="3"></audio>
{sfx_tags}
    </div>
    <script>
      const tl = gsap.timeline({{ paused: true }});
{chr(10).join(rig_js)}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
"""
(ROOT / "index.html").write_text(index, encoding="utf-8")
print(f"total {TOTAL:.1f}s, {len(BEATS)} beats, {len(videos)} footage segments, {len(sounds)} sounds, {len(groups)} caption groups")
for b in BEATS:
    print(f"  {b['id']:14s} {b['start']:6.2f}s +{b['dur']:.2f}")
for v in videos:
    print(f"  {v['id']:22s} rate {v['rate']}")
