import { STORAGE_KEY, freshState, parseRecord, validateState } from './core.mjs';

export function loadLocal(storage) {
  let raw;
  try { raw = storage.getItem(STORAGE_KEY); }
  catch { return { state: freshState(), mode: 'memory', raw: null }; }
  if (raw === null) return { state: freshState(), mode: 'ready', raw: null };
  try { return { state: parseRecord(raw), mode: 'ready', raw: null }; }
  catch { return { state: freshState(), mode: 'corrupt', raw }; }
}
export function saveLocal(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(validateState(state)));
    return true;
  } catch { return false; }
}

