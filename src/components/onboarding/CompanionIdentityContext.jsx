// The account's saved appearance: one value that the world avatar, the creator
// preview and the HUD portrait all read. Hydrated from the user profile on
// first use and cached locally so a reload shows the same character instantly.
import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

const STORAGE_KEY = 'atomxe.companion.appearance.v1';

let state = null;
let listeners = new Set();
let hydration = null;

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function emit() {
  listeners.forEach((fn) => fn(state));
}

export function setCompanionIdentity(next) {
  state = next && typeof next === 'object' ? next : null;
  try {
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage blocked */
  }
  emit();
}

function hydrate() {
  if (hydration) return hydration;
  hydration = (async () => {
    const stored = readStored();
    if (stored) {
      state = stored;
      emit();
    }
    try {
      const me = await base44.auth.me();
      const saved = me?.avatar_appearance;
      if (saved && typeof saved === 'object') {
        state = saved;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
        } catch {
          /* storage blocked */
        }
        emit();
      }
    } catch {
      /* signed out */
    }
  })();
  return hydration;
}

export function useCompanionIdentity() {
  const [value, setValue] = useState(state);
  useEffect(() => {
    listeners.add(setValue);
    setValue(state);
    hydrate();
    return () => listeners.delete(setValue);
  }, []);
  return value;
}