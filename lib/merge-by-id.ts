/**
 * Mezcla una página recién traída con la anterior, CONSERVANDO la referencia de
 * objeto de las filas idénticas (mismas por `id` y JSON byte-a-byte). React así
 * salta el re-render de las tarjetas que no cambiaron — el polling deja de
 * repintar toda la lista cada ciclo. Si NADA cambió, devuelve el array previo
 * entero (misma ref) → cero trabajo de reconciliación. Sin librería.
 */
export function mergeById<T>(prev: T[], next: T[]): T[] {
  if (prev.length === 0) return next;
  const prevById = new Map<unknown, T>();
  for (const row of prev) prevById.set(idOf(row), row);
  let allSame = prev.length === next.length;
  const merged = next.map((row, i) => {
    const old = prevById.get(idOf(row));
    if (old && shallowEqualJson(old, row)) {
      if (prev[i] !== old) allSame = false;
      return old;
    }
    allSame = false;
    return row;
  });
  return allSame ? prev : merged;
}

function idOf(row: unknown): unknown {
  return (row as { id?: unknown })?.id;
}

function shallowEqualJson<T>(a: T, b: T): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
