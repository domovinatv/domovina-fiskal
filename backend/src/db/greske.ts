// Prepoznavanje D1/SQLite grešaka. D1 ne daje kod greške, samo tekst
// („UNIQUE constraint failed: tablica.stupac”), pa je ovo jedino mjesto koje
// taj tekst čita.

// Je li greška povreda jedinstvenosti — po želji baš na zadanom stupcu?
export function jeUniqueGreska(e: unknown, stupac?: string): boolean {
  const poruka = String((e as Error)?.message ?? e);
  return poruka.includes('UNIQUE') && (stupac === undefined || poruka.includes(stupac));
}
