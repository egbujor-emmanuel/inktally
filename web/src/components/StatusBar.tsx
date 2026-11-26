import type { ReactNode } from 'react';
import { useDeviceAI, useInferenceCounts, useOnline } from '../hooks/useStatus';
import { usePrivateMode } from '../ai/privacy';

/** Same wording as the Android StatusStrip. */
const DEVICE_COPY: Record<string, string> = {
  checking: 'Checking on-device AI…',
  available: 'Gemini Nano ready',
  downloadable: 'Gemini Nano not downloaded',
  downloading: 'Downloading Gemini Nano…',
  unavailable: 'Cloud AI (no on-device model)',
  unsupported: 'Cloud AI (no on-device model)',
};

function Chip({ children, dot, strong = false }: { children: ReactNode; dot?: string; strong?: boolean }) {
  return (
    <span className={`chip ${strong ? 'text-ink' : 'text-ink-soft'}`}>
      {dot && <span aria-hidden className="size-[7px] rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}

/** One swipeable line of status chips — connectivity, where AI runs, live on-device / cloud counts — plus a trailing link. */
export function StatusBar({ trailing }: { trailing?: ReactNode }) {
  const isOnline = useOnline();
  const device = useDeviceAI();
  const counts = useInferenceCounts();
  const privateMode = usePrivateMode();
  const total = counts.on_device + counts.in_cloud;
  const ready = device.availability === 'available';
  const offlineText = ready ? 'Offline — marking on this device' : 'Offline — marked when back online';

  return (
    <div className="grid gap-1.5 py-1" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2 px-4">
        <Chip dot={isOnline ? 'var(--color-device)' : 'var(--color-flag)'} strong>{isOnline ? 'Online' : offlineText}</Chip>
        <Chip dot={ready ? 'var(--color-device)' : 'var(--color-cloud)'}>
          {device.progress !== null ? `Downloading Gemini Nano… ${Math.round(device.progress * 100)}%` : DEVICE_COPY[device.availability]}
        </Chip>
        {privateMode && <Chip dot="var(--color-device)" strong>Private: no pupil work to cloud AI</Chip>}
        {total > 0 && <Chip strong>{counts.on_device} on-device · {counts.in_cloud} cloud</Chip>}
        {trailing}
      </div>
      {device.availability === 'downloadable' && device.progress === null && (
        <div className="px-4"><button type="button" className="btn-pen" onClick={() => void device.enable()}>Download on-device AI</button></div>
      )}
      {device.error && <p className="px-4 text-sm text-pen">{device.error}</p>}
    </div>
  );
}
