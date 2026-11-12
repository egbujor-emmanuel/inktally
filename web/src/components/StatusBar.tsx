import { useDeviceAI, useInferenceCounts, useOnline } from '../hooks/useStatus';

const DEVICE_COPY: Record<string, string> = {
  checking: 'Checking on-device AI…',
  available: 'On-device AI ready',
  downloadable: 'On-device AI not downloaded',
  downloading: 'On-device AI downloading',
  unavailable: 'This device can’t run on-device AI — using the cloud',
  unsupported: 'Browser has no on-device AI — using the cloud',
};

/** Always-visible honesty strip: connectivity, where marking runs, and live on-device vs cloud counts. */
export function StatusBar() {
  const isOnline = useOnline();
  const device = useDeviceAI();
  const counts = useInferenceCounts();
  const canEnable = device.availability === 'downloadable' || device.availability === 'downloading';
  const total = counts.on_device + counts.in_cloud;
  const onDeviceShare = total ? Math.round((counts.on_device / total) * 100) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" role="status" aria-live="polite">
      <span className="inline-flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ background: isOnline ? 'var(--color-device)' : 'var(--color-flag)' }} aria-hidden />
        {isOnline ? 'Online' : device.availability === 'available'
          ? 'Offline — marking on this device, cloud checks will run later'
          : 'Offline — photos are saved and marked when you’re back online'}
      </span>
      <span className="text-ink-soft">{DEVICE_COPY[device.availability]}</span>
      {canEnable && device.progress === null && (
        <button type="button" className="btn-ghost text-xs" onClick={() => void device.enable()}>Enable on-device AI</button>
      )}
      {device.progress !== null && <span className="text-ink-soft">Downloading model… {Math.round(device.progress * 100)}%</span>}
      {device.error && <span className="text-pen">{device.error}</span>}
      {total > 0 && (
        <span className="ml-auto font-medium" title="Inferences this session">
          <span style={{ color: 'var(--color-device)' }}>{counts.on_device} on-device</span>
          {' · '}
          <span style={{ color: 'var(--color-cloud)' }}>{counts.in_cloud} cloud</span>
          {onDeviceShare !== null && onDeviceShare > 0 && <span className="text-ink-soft"> ({onDeviceShare}% free & private)</span>}
        </span>
      )}
    </div>
  );
}
