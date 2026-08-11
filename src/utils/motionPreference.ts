const MOTION_PREFERENCE_KEY = 'wildroads_reduced_motion';

type MotionPreferenceListener = (reduced: boolean) => void;

const listeners = new Set<MotionPreferenceListener>();
const systemPreference = window.matchMedia('(prefers-reduced-motion: reduce)');

function readStoredPreference(): boolean | null {
  try {
    const stored = localStorage.getItem(MOTION_PREFERENCE_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return null;
}

let storedPreference = readStoredPreference();

export function getReducedMotion(): boolean {
  return storedPreference ?? systemPreference.matches;
}

function notifyListeners() {
  const reduced = getReducedMotion();
  listeners.forEach((listener) => listener(reduced));
}

export function toggleReducedMotionPreference(): boolean {
  storedPreference = !getReducedMotion();
  try {
    localStorage.setItem(MOTION_PREFERENCE_KEY, String(storedPreference));
  } catch {
    // The in-memory preference still applies for the current session.
  }
  notifyListeners();
  return storedPreference;
}

export function subscribeMotionPreference(listener: MotionPreferenceListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

systemPreference.addEventListener('change', () => {
  if (storedPreference === null) notifyListeners();
});
