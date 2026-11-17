// Future Windows install preference. Choosing the .exe only remembers the
// request. This module must not offer a download until a real installer URL exists.
export const GAME3D_DESKTOP_INSTALL_KEY = 'game3d_desktop_install_v1';
export const GAME3D_DESKTOP_INSTALL_EVENT = 'game3dDesktopInstallChanged';
export const GAME3D_WINDOWS_EXE_URL = null;

export function normalizeGame3DDesktopTarget(value) {
  return value === 'windows-exe' ? 'windows-exe' : 'browser';
}

export function readGame3DDesktopInstall(host = typeof window === 'undefined' ? null : window) {
  let target = 'browser';
  try {
    const saved = JSON.parse(host?.localStorage?.getItem(GAME3D_DESKTOP_INSTALL_KEY) || 'null');
    target = normalizeGame3DDesktopTarget(saved?.target);
  } catch { target = 'browser'; }
  return Object.freeze({
    target,
    exeReady: typeof GAME3D_WINDOWS_EXE_URL === 'string' && GAME3D_WINDOWS_EXE_URL.length > 0,
    url: GAME3D_WINDOWS_EXE_URL,
  });
}

export function saveGame3DDesktopInstall(target, host = typeof window === 'undefined' ? null : window) {
  const next = readGame3DDesktopInstall(host);
  const saved = Object.freeze({
    target: normalizeGame3DDesktopTarget(target),
    exeReady: next.exeReady,
    url: next.url,
  });
  try {
    host?.localStorage?.setItem(GAME3D_DESKTOP_INSTALL_KEY, JSON.stringify({ target: saved.target }));
  } catch { /* private mode must not break the menu */ }
  try {
    host?.dispatchEvent?.(new CustomEvent(GAME3D_DESKTOP_INSTALL_EVENT, { detail: saved }));
  } catch { /* the saved value still stands */ }
  return saved;
}
