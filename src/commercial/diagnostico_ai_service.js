import {
  create_diagnostico_ai,
  get_diagnostico_ai,
  list_diagnosticos_ai,
  update_diagnostico_ai,
} from "./diagnostico_ai_repository.js";

const status_validos = new Set([
  "nuevo",
  "entrevista",
  "analisis",
  "propuesta_lista",
  "ganado",
  "perdido",
  "reembolsado",
]);

export class diagnostico_ai_service {
  constructor({ pool }) {
    this.pool = pool;
  }

  async crear(input) {
    if (!input.negocio_nombre) {
      throw new Error("negocio_nombre es requerido.");
    }

    return create_diagnostico_ai(this.pool, input);
  }

  async actualizar(diagnostico_id, patch) {
    return update_diagnostico_ai(this.pool, diagnostico_id, patch);
  }

  async listar(filtros) {
    return list_diagnosticos_ai(this.pool, filtros);
  }

  async obtener(diagnostico_id) {
    return get_diagnostico_ai(this.pool, diagnostico_id);
  }

  async cambiar_status(diagnostico_id, status) {
    if (!status_validos.has(status)) {
      throw new Error(`Status invalido: ${status}`);
    }

    return update_diagnostico_ai(this.pool, diagnostico_id, { status });
  }

  async generar_propuesta_preliminar(diagnostico_id) {
    const diagnostico = await get_diagnostico_ai(this.pool, diagnostico_id);

    if (!diagnostico) {
      return null;
    }

    const bots_recomendados = diagnostico.bots_recomendados?.length
      ? diagnostico.bots_recomendados
      : diagnostico.paquete_recomendado
        ? [diagnostico.paquete_recomendado]
        : [];
    const precio = diagnostico.precio_mensual_sugerido ?? 2000;
    const propuesta_resumen = {
      negocio_nombre: diagnostico.negocio_nombre,
      giro: diagnostico.giro,
      bots_recomendados,
      precio_mensual_sugerido: precio,
      diagnostico_acreditable: diagnostico.acreditable,
      resumen:
        `Propuesta preliminar para ${diagnostico.negocio_nombre}: iniciar con bot configurable ` +
        `${bots_recomendados[0] ?? "por definir"} ` +
        `por MXN ${precio} mensuales, acreditando diagnóstico si aplica.`,
      siguientes_pasos: [
        "Validar knowledge base mínima.",
        "Definir acciones que requieren aprobación.",
        "Configurar bot y número de WhatsApp.",
      ],
    };

    return update_diagnostico_ai(this.pool, diagnostico_id, {
      bots_recomendados,
      paquete_recomendado: bots_recomendados[0] ?? null,
      precio_mensual_sugerido: precio,
      propuesta_resumen,
      status: "propuesta_lista",
    });
  }
}
