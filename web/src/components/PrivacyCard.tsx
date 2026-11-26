import { setPrivate, usePrivateMode } from '../ai/privacy';
import { Card } from '../ui/Kit';

/** Same wording as the Android Private mode switch (SchoolScreen). */
export function PrivacyCard() {
  const on = usePrivateMode();
  return (
    <Card>
      <label className="flex items-start gap-3 text-[15px]">
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-pen" checked={on} onChange={(e) => setPrivate(e.target.checked)} />
        <span>
          <span className="font-semibold">Private mode: no pupil’s work goes to any cloud AI</span>
          <span className="mt-1 block text-[13px] text-ink-soft">
            Every answer is read and marked here by Gemini Nano. No photo, answer or name is sent to any cloud AI, and the cloud check is off,
            so you confirm uncertain marks yourself. The cloud is used only to draft an answer key from your own question paper or marking guide.
            Needs Gemini Nano on this device.
          </span>
        </span>
      </label>
      <p className="text-[13px] text-ink-soft">
        With Private mode off, answers also go to Gemini in the cloud for a second reading, which is what lets InkTally mark an answer “Verified”:
        a printed InkTally sheet sends only the cut-out answer boxes, an exercise-book page sends the page. Names you type are never sent to any AI.
        In every mode, marks, readings and names are saved to your own account, so web and Android stay in step; photos stay on this device.
      </p>
    </Card>
  );
}
