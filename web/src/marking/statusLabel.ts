import type { Mark } from '../domain/types';

const CROSS_CHECKED = /confirmed by the cloud check/i;

/**
 * What the status chip says. "Verified" is kept for marks that were read twice and agreed (on-device read confirmed
 * by the cloud, or a second cloud read). A single cloud reading is "Cloud read": trusted, but not double-checked.
 */
export function statusLabel(mark: Mark): string {
  switch (mark.status) {
    case 'provisional': return 'Provisional';
    case 'flagged': return 'Check this';
    case 'reviewed': return 'Reviewed';
    case 'verified': return mark.reasons.some((r) => CROSS_CHECKED.test(r)) ? 'Verified' : 'Cloud read';
  }
}
