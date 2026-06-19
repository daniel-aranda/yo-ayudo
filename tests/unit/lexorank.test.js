import { describe, it, expect } from "vitest";
import { rank_between } from "../../src/crm/lexorank.js";

describe("lexorank rank_between", () => {
  it("genera un rank inicial a la mitad cuando ambos extremos están abiertos", () => {
    const r = rank_between("", "");
    expect(r).toBeTruthy();
    expect(r > "").toBe(true);
  });

  it("antes de x: rank_between('', x) < x; después de x: rank_between(x, '') > x", () => {
    expect(rank_between("", "n") < "n").toBe(true);
    expect(rank_between("n", "") > "n").toBe(true);
  });

  it("entre dos ranks no adyacentes cae estrictamente en medio", () => {
    const mid = rank_between("g", "n");
    expect("g" < mid && mid < "n").toBe(true);
  });

  it("entre caracteres consecutivos extiende la longitud (n < nn < o)", () => {
    const mid = rank_between("n", "o");
    expect("n" < mid && mid < "o").toBe(true);
    expect(mid.length).toBeGreaterThan(1);
  });

  it("soporta inserciones repetidas en el MISMO hueco sin romper el orden", () => {
    // Insertamos siempre justo después de `lo` y antes del `hi` fijo: cada nuevo
    // rank debe quedar entre el anterior y `hi`, y todos estrictamente ordenados.
    const hi = "n";
    let lo = "";
    const generated = [];
    for (let i = 0; i < 200; i += 1) {
      const r = rank_between(lo, hi);
      expect(lo < r, `iter ${i}: ${JSON.stringify(lo)} < ${JSON.stringify(r)}`).toBe(true);
      expect(r < hi, `iter ${i}: ${JSON.stringify(r)} < ${JSON.stringify(hi)}`).toBe(true);
      generated.push(r);
      lo = r;
    }
    // El conjunto generado está estrictamente creciente.
    const sorted = [...generated].sort();
    expect(generated).toEqual(sorted);
    expect(new Set(generated).size).toBe(generated.length);
  });

  it("mantiene el orden tras 500 inserciones aleatorias en huecos de una lista", () => {
    // Simula un tablero: empezamos con un item y vamos insertando en posiciones
    // aleatorias, verificando que la lista siempre quede ordenada por rank.
    const list = [rank_between("", "")]; // [rankInicial]
    for (let i = 0; i < 500; i += 1) {
      const at = Math.floor((i * 2654435761) % (list.length + 1)); // pseudo-aleatorio determinista
      const before = at > 0 ? list[at - 1] : "";
      const after = at < list.length ? list[at] : "";
      const r = rank_between(before, after);
      if (before) expect(before < r).toBe(true);
      if (after) expect(r < after).toBe(true);
      list.splice(at, 0, r);
    }
    const sorted = [...list].sort();
    expect(list).toEqual(sorted);
    expect(new Set(list).size).toBe(list.length); // sin colisiones
  });
});
