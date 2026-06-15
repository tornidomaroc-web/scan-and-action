import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';

// The capture flow uses the web <input capture> path (one code path for web and
// native). On Android, because we DECLARE android.permission.CAMERA in the
// manifest, the ACTION_IMAGE_CAPTURE intent that <input capture> fires will FAIL
// unless the permission is granted at runtime. So we gate the camera with a
// runtime request here. We use @capacitor/camera purely for its permission API
// — not its getPhoto() capture — so the rest of the pipeline is unchanged.
//
// Returns true if the camera may be opened. On web it is always true. On native,
// if the user denies, the caller keeps file/gallery/PDF picking fully working.
export async function ensureCameraPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const status = await Camera.checkPermissions();
    if (status.camera === 'granted' || status.camera === 'limited') return true;
    const req = await Camera.requestPermissions({ permissions: ['camera'] });
    return req.camera === 'granted' || req.camera === 'limited';
  } catch {
    // Plugin error / no camera hardware — don't dead-end; let the caller fall
    // back to file picking.
    return false;
  }
}
