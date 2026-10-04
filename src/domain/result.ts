/** Esito di una validazione: il valore, oppure l'elenco dei campi sbagliati (mai i valori inseriti). */
export type Result<T, Issue extends string> =
  { ok: true; value: T } | { ok: false; issues: Issue[] };

export function fail<Issue extends string>(issues: Issue[]): { ok: false; issues: Issue[] } {
  return { ok: false, issues: [...new Set(issues)] };
}
