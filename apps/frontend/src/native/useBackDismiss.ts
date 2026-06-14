import { useEffect, useRef } from 'react';
import { pushOverlay } from './overlayStack';

// Registers `onClose` on the overlay stack while `active` is true, so the
// Android hardware back button dismisses this overlay before doing anything
// else. No-op effect on web (the stack is simply never consulted there).
//
// onClose is read through a ref so a changing handler identity does not churn
// the registration on every render.
export function useBackDismiss(active: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    return pushOverlay(() => onCloseRef.current());
  }, [active]);
}
