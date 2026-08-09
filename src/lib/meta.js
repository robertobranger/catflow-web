import { fetchMeta } from './api.js';

const KEY = 'catflow.meta';

const EMPTY = { accounts: [], domains: [], people: [], concepts: [], counterparties: [] };

export function loadCachedMeta() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

export function saveCachedMeta(meta) {
  localStorage.setItem(KEY, JSON.stringify(meta));
}

/** Fetch fresh meta from the sheet and cache it. */
export async function refreshMeta() {
  const data = await fetchMeta();
  const meta = {
    accounts: data.accounts || [],
    domains: data.domains || [],
    people: data.people || [],
    concepts: data.concepts || [],
    counterparties: data.counterparties || [],
  };
  saveCachedMeta(meta);
  return meta;
}

/** Add locally-entered values so autocomplete works before next refresh. */
export function rememberLocal(meta, tx) {
  const next = { ...meta };
  if (tx.concept && !next.concepts.includes(tx.concept)) {
    next.concepts = [tx.concept, ...next.concepts];
  }
  if (tx.counterparty && !next.counterparties.includes(tx.counterparty)) {
    next.counterparties = [tx.counterparty, ...next.counterparties];
  }
  saveCachedMeta(next);
  return next;
}
