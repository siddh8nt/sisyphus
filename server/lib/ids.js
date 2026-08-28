import { randomUUID, createHash } from 'node:crypto';

/** Short random id for endpoints/tasks/sessions. */
export function shortId() {
  return randomUUID().slice(0, 8);
}

/** Stable logical-phone id derived from its name, so re-registers map to the same phone. */
export function phoneIdFromName(name) {
  return 'ph_' + createHash('sha1').update(String(name)).digest('hex').slice(0, 8);
}
