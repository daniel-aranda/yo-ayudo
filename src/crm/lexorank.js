// LexoRank-style ordenamiento para el tablero CRM. Cada prospecto guarda un
// `pipeline_rank`: un string lexicográficamente ordenable. Dentro de una columna
// los prospectos se ordenan por ese string (ascendente). Para mover una tarjeta
// entre otras dos se genera un string ESTRICTAMENTE entre los ranks vecinos
// (`rank_between`), así reordenar inserta sin renumerar al resto del tablero.
//
// Alfabeto: minúsculas a–z. Un rank vacío ('') es un extremo abierto:
//   rank_between('', x)  → algo ANTES de x
//   rank_between(x, '')  → algo DESPUÉS de x
//   rank_between('', '') → rank inicial (≈ "n", a la mitad)
//
// Implementación "midstring" clásica con centinelas 'a'-1 (96) y 'z'+1 (123).
// Es correcta en el caso difícil — insertar repetidamente en el mismo hueco —
// porque extiende la longitud del string en vez de quedarse sin valores entre dos
// ranks adyacentes (p. ej. entre "n" y "o" produce "nn", luego "ng", etc.).

const BEFORE_A = 96; // 'a' - 1
const AFTER_Z = 123; // 'z' + 1

/**
 * Genera un rank estrictamente entre `prev` y `next` (ambos minúsculas a–z, o ''
 * para un extremo abierto). Requiere prev < next lexicográficamente cuando ambos
 * están presentes.
 */
export function rank_between(prev = "", next = "") {
  prev = String(prev ?? "");
  next = String(next ?? "");

  let p;
  let n;
  let pos;
  // Localiza el primer carácter en que difieren (centinelas para los extremos).
  for (pos = 0, p = 0, n = 0; p === n; pos += 1) {
    p = pos < prev.length ? prev.charCodeAt(pos) : BEFORE_A;
    n = pos < next.length ? next.charCodeAt(pos) : AFTER_Z;
  }

  let str = prev.slice(0, pos - 1); // prefijo común

  if (p === BEFORE_A) {
    // `prev` se acabó (o es prefijo de `next`): bajamos por 'a' mientras `next`
    // siga en 'a', para meternos justo antes del primer carácter mayor.
    while (n === 97) {
      n = pos < next.length ? next.charCodeAt(pos++) : AFTER_Z;
      str += "a";
    }
    if (n === 98) {
      str += "a";
      n = AFTER_Z;
    }
  } else if (p + 1 === n) {
    // Caracteres consecutivos (p. ej. 'n' y 'o'): tomamos el de `prev` y bajamos
    // por las 'z' finales de `prev` para extender la longitud.
    str += String.fromCharCode(p);
    n = AFTER_Z;
    while ((p = pos < prev.length ? prev.charCodeAt(pos++) : BEFORE_A) === 122) {
      str += "z";
    }
  }

  str += String.fromCharCode(Math.ceil((p + n) / 2));
  return str;
}
