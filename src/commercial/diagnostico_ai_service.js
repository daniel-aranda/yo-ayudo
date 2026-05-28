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

function inferir_paquete(respuestas = {}, oportunidades = []) {
  const texto = JSON.stringify({ respuestas, oportunidades }).toLowerCase();

  if (texto.includes("factura") || texto.includes("fiscal")) {
    return "factura_facil";
  }

  if (texto.includes("documento") || texto.includes("pdf") || texto.includes("captura")) {
    return "documentos_facil";
  }

  if (texto.includes("cita") || texto.includes("agenda")) {
    return "agenda_facil";
  }

  if (texto.includes("cobranza") || texto.includes("pago")) {
    return "cobranza_suave";
  }

  if (texto.includes("seguimiento") || texto.includes("prospecto") || texto.includes("venta")) {
    return "seguimiento_ventas";
  }

  return "recepcionista_ai";
}

function precio_sugerido(paquete_id) {
  const precios = {
    recepcionista_ai: 1500,
    seguimiento_ventas: 2500,
    agenda_facil: 2500,
    factura_facil: 3000,
    documentos_facil: 3500,
    cobranza_suave: 3500,
    reporte_diario: 1500,
    llamadas_y_conexion: 4000,
  };

  return precios[paquete_id] ?? 2000;
}

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

    const paquete_id = diagnostico.paquete_recomendado || inferir_paquete(
      diagnostico.respuestas_entrevista,
      diagnostico.oportunidades_ai,
    );
    const precio = diagnostico.precio_mensual_sugerido ?? precio_sugerido(paquete_id);
    const propuesta_resumen = {
      negocio_nombre: diagnostico.negocio_nombre,
      giro: diagnostico.giro,
      paquete_recomendado: paquete_id,
      precio_mensual_sugerido: precio,
      diagnostico_acreditable: diagnostico.acreditable,
      resumen:
        `Propuesta preliminar para ${diagnostico.negocio_nombre}: iniciar con ${paquete_id} ` +
        `por MXN ${precio} mensuales, acreditando diagnóstico si aplica.`,
      siguientes_pasos: [
        "Validar knowledge base mínima.",
        "Definir acciones que requieren aprobación.",
        "Configurar bot y número de WhatsApp.",
      ],
    };

    return update_diagnostico_ai(this.pool, diagnostico_id, {
      paquete_recomendado: paquete_id,
      precio_mensual_sugerido: precio,
      propuesta_resumen,
      status: "propuesta_lista",
    });
  }
}
