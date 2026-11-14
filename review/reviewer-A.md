# REDPEN - Reviewer A scorecard (#BuildHybridAI 2026)

Method: live app at https://redpen-hybrid.web.app. Passcode gate checked in a fresh browser, then a real Chrome driven through Playwright at 412x915 and 1280x800. File uploads used the real sample images. The in-session Playwright MCP could not upload files, so I scripted Chrome through the node Playwright package. No project files were modified. Android is noted as existing but was not tested.

## What I tested and saw

| Flow | Result |
|---|---|
| Passcode | A fresh browser shows "REDPEN preview / Access code / Enter". The code redpen-3015d8 was accepted. |
| Home | Strong first screen. Headline: "A stack of classwork, marked in minutes. Even offline." There are two CTAs, a 3-step "how it works" strip, assignment tabs, and 3 samples. Status chips read "Online" and "Cloud AI (no on-device model)", so the hybrid state is visible. |
| Quick mark, maths.png | About 4 s to draft the key. 6 questions: 7x8=56, 15+9=24, 144/12=12, 3/4+1/4=1, 25% of 80=20, 6 crates x 4,500=27000. All correct, shown in an editable "Does this answer key look right?" screen. After "Looks right - mark it", the total came back in about 4 s: **Total 4/6**. The two wrong answers were caught (Q2 "23; expected 24", Q5 "25; expected 20"). Each row shows "AI read: ...", "Cloud", "Marked by code" and "Verified" chips plus a plain-language reason. |
| English sample, Print sheets | A sheet with 4 black corner squares, name/number field, 5 answer boxes, and Print/Share PDF buttons. It also offers an "Exercise book page" mode for people without a printer. |
| Mark, english-sheet-photo.jpg | About 4 s to mark. **Total 3/5**, which matches the truth. Q3 "B; correct is A" and Q5 "runned is listed as not acceptable" were marked wrong. The marked copy is the student's own sheet with ticks, crosses, a circled 3/5, a per-answer crop image for each question, and Share/Print. Comment saved ("Saved. It is on the marked copy and in the Excel register."). |
| Own marking scheme, english-marking-scheme.jpg | Added through "Already have a marking scheme?". The button changed to "Use my marking scheme". About 8 s later it produced a step-2 key: Q1 B, Q2 D, Q3 A, Q4 accept "Abuja / F.C.T.", Q5 accept "ran" with do-not-accept "runned" and 2 marks. It was copied faithfully, including the handwritten Q5 weighting and the reject list. This is a strong feature. |
| Mark register | Class average line, a table with Q1..Q5, Total, Status and Comment columns, and per-student "Marked copy". Tapping a name opens a modal (Name or number / Cancel / Save) and the rename persisted. Excel download worked and gave a valid .xlsx (`English-Grammar-Check-marks.xlsx`) with per-question marks, the total, and a 0.6 percentage. CSV and Print register are also offered. HTML and emoji in a name are stored as literal text with no injection. |
| Review | "0 answers to check - Check with the cloud - All marks are verified or reviewed." With no on-device reads here, the hybrid double-check could not be shown in action. |
| Insights | Per-question averages, "Answers that lost marks: 'B' x1", and a Catch-up sheet button. The catch-up sheet for Q3 took about 5 s and was good: a correct explanation ("goes" vs "go"), 4 practice items with "Show answer", and Share/Print. |
| School details | Institution name, details, and teacher name fields, and a "Save details" button. I did not fill these in, so the letterhead on the marked copy was not seen. |
| Finish | "Mark as finished" turned into "Reopen", and the home screen showed "Finished (1)". |
| Delete | Clicking Delete did not remove the assignment and fired no native dialog. I did not find or confirm an in-app confirm modal, so this is unverified. |
| Console | 0 console errors. |

## Bugs, confusion and visual issues, with reproduction steps

1. **Quick mark key has 6 questions, but the brief says the page has 7.** Steps: /quick, upload maths.png. The key and the total are 4/6, not 5/7. I can't tell whether the photo really has only 6 lines. If a 7th exists it was silently dropped. Also, Q4 was "read" as "3 1/4 + 4 1/4 = 1", a misread of 3/4 + 1/4, and it still got a green "Verified" chip. A mark that rests on a wrong read looks verified. That undermines the trust story.
2. **"Verified" is shown when the cloud both read and checked.** Steps: any mark in this browser. The chips are "Cloud / Marked by code / Verified". With no on-device read there is no independent check, so "Verified" is meaningless here. Show "Cloud-read (no second check)" instead.
3. **I never saw the core hybrid story.** The reviewer browser has no Gemini Nano. Review showed "0 answers to check". There is no demo or simulation toggle on the web to show an on-device read being checked by the cloud. A judge on desktop Chrome with no Nano sees only a cloud OCR app.
4. **Student defaults to a timestamp.** Steps: Mark, leave name blank, upload. The student becomes "Student 5:02:22 AM". The printed sheet has a handwritten Name box but the app doesn't read it (a deliberate privacy choice), so the teacher has to type every name before marking. The register is then full of timestamps. Offer "Student 1, 2, 3" numbering or an optional name-read.
5. **Stray italic kicker "no second round of marking"** sits above "Marked copy for ...". Steps: mark any sheet and scroll to the marked copy. It reads like a leftover string with no meaning. Remove it or explain it.
6. **Desktop is a narrow 736px column on a 1280 viewport.** Steps: resize to 1280. The mobile nav is stacked as two big buttons. It works, but nothing is adapted, so it reads as a phone app in a window.
7. **Delete gives no visible feedback or confirmation** (see the table). Steps: open an assignment, click Delete. The page stays unchanged.
8. **Draft/Use scheme button is disabled with no hint.** Steps: /new, empty form. "Draft marking scheme" is greyed out with no message saying what is missing.
9. **The passcode gate is the first thing a judge sees.** That is acceptable for a preview, but there is no hint on the screen about where the code comes from.
10. **Letterhead not demonstrated.** Both the marked copy and the register show "Tip: add your school details..." until the teacher fills in School details. The default sample flow therefore shows a headerless marked copy. Pre-fill the samples with a demo school.
11. **Hybrid quota/error states untested.** I hit no quota error, so I can't comment on error UX.

## Scores (official criteria, 1-5)

### 1. Technological Implementation: 4/5
Evidence:
- The reading/marking split is the right design: "AI read: 'B'" followed by "Marked by code", with a reason string. It is deterministic and auditable.
- Markup, crops and corner-square registration work on a real photo. I got exactly 3/5 on the English photo.
- The scheme is copied exactly from a handwritten photo, including the 2-mark weighting and the reject list.
- Quick mark, the editable key, the Excel export, the AI worksheets, and the status chips all work, with 0 console errors and 4-8 s latency.
- Weakness: I could not see Firebase AI Logic hybrid inference actually choosing on-device, because Nano was unavailable. The chip "Cloud AI (no on-device model)" is honest, but nothing verifiable shows the on-device path or the cloud double-check disagreement flow. Treat the "Verified" chip with the Q4 misread as a correctness gap.

### 2. Design: 4/5
Evidence:
- A coherent, branded product with a real identity: a handwriting kicker, a serif headline, a red-pen palette, and ruled-paper lines.
- A complete lifecycle: print sheets, mark, comment, marked copy, register, review, insights, catch-up, finish.
- Gaps: the stray string, timestamp student names, desktop not adapted, Delete feedback, and the disabled button with no hint. The letterhead is not in the default demo path.

### 3. Potential Impact: 4/5
Evidence:
- A named audience (teachers and examiners marking stacks, including offline in low-connectivity places) with a specific pain: tonight's pile.
- The paper-first workflow (printed sheet, or an exercise book page) and the Excel register fit real classroom habits, and the catch-up worksheet closes the loop.
- The privacy claim ("Students' work stays with you; names never leave the device") is concrete.
- Gap: there is no stated evidence of real users or an accuracy benchmark inside the product. The impact case is argued, not demonstrated.

### 4. Quality of the Idea: 4/5
Evidence:
- "AI reads, plain code marks, cloud double-checks" is a non-obvious, well-justified use of hybrid inference. Quick mark (one photo to key to marked) and "copy my scheme exactly" show real understanding of teachers' trust problem.
- Marking is a known category, though, and winners tend to have a sharper single hook.

**Average: 4.0 / 5.** **Verdict: PASS (every criterion >= 4), but only just, with no margin on any score.**

Tie-break order Tech > Design > Impact > Idea: all four scores are equal at 4, so the tie-break gives no separation.

## Comparison with the previous on-device winners
Same bar on named audience (teachers), complete live product (clearly more complete than most), and real technical depth (grid registration, deterministic marking, a reasoned hybrid split). Where winners typically beat this: a moment the judge can see and feel the on-device path working on their own device. Here the reviewer on desktop never sees it. A sponsor would showcase the product, but the showcase clip has to show the offline-to-online double-check.

## Prioritized gaps (what exactly to change)

### To raise Technological Implementation to 5
1. Make the hybrid path demonstrable on a Nano-less browser: a visible "Simulate on-device read" demo mode, or a pre-seeded sample marked "read on-device" that shows a flagged disagreement in Review and the cloud resolving it.
2. Fix the "Verified" semantics (issue 2). When the reader is the cloud, show "Cloud-read, no second check". Reserve "Verified" for an independent second pass.
3. Show confidence or "unclear read" flags, so a misread such as Q4 "3 1/4 + 4 1/4" is routed to Review instead of getting a green chip.
4. Publish a small accuracy benchmark (for example, N sheets read on-device vs cloud, with agreement rate) inside the app or its docs.

### To raise Design to 5
1. Fix issues 4, 5, 7, 8 and 10: sequential student names by default, remove the stray text, give Delete a visible confirm and result, add a hint for the disabled button, and pre-fill demo school details so the letterhead shows.
2. Make the 1280 view a proper two-column layout: the marking input on the left, the live marked copy on the right, and a horizontal nav.

### To raise Potential Impact to 5
1. Show evidence in the product or its narrative: a named school, a real number of scripts marked, a time-saved figure (minutes per script vs by hand), and a clear low-connectivity story.
2. Add a short "trust" view showing agreement with a human marker on a real class set.

### To raise Quality of the Idea to 5
1. Lead with one memorable hook that only hybrid inference makes possible, for example "mark in a village with no signal, then watch the cloud audit the whole pile on the way home". Make that moment the first screen of the demo path.
