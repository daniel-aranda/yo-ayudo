export const discovery_interview = {
  interview_id: "diagnostico_ai_negocio",
  version: 1,
  nombre: "Entrevista de diagnóstico AI para negocios",
  bloques: [
    {
      bloque_id: "llegada_clientes",
      titulo: "Llegada de clientes",
      preguntas: [
        "¿De dónde llegan tus clientes?",
        "¿Cuántos mensajes o llamadas reciben al día?",
        "¿Quién responde?",
        "¿Qué pasa fuera de horario?",
        "¿Dónde se pierden prospectos?",
      ],
    },
    {
      bloque_id: "ventas",
      titulo: "Ventas",
      preguntas: [
        "¿Cómo cotizan?",
        "¿Quién da seguimiento?",
        "¿Cuánto tardan en responder?",
        "¿Cuántas veces intentan contactar antes de rendirse?",
        "¿Quién autoriza descuentos?",
      ],
    },
    {
      bloque_id: "tareas_repetitivas",
      titulo: "Tareas repetitivas",
      preguntas: [
        "¿Qué hacen todos los días que les quita tiempo?",
        "¿Qué mensajes copian y pegan?",
        "¿Qué información piden siempre?",
        "¿Qué se les olvida?",
      ],
    },
    {
      bloque_id: "documentos_capturas",
      titulo: "Documentos y capturas",
      preguntas: [
        "¿Reciben PDFs, fotos, tickets, facturas o comprobantes?",
        "¿Qué datos necesitan extraer?",
        "¿Usan capturas de sistemas?",
        "¿Qué documentos deben revisar?",
      ],
    },
    {
      bloque_id: "sistemas_actuales",
      titulo: "Sistemas actuales",
      preguntas: [
        "¿Usan Excel, CRM, punto de venta, Google Sheets, sistema administrativo?",
        "¿Hay APIs o todo se maneja manual?",
        "¿Se puede operar con capturas o archivos al inicio?",
      ],
    },
    {
      bloque_id: "llamadas",
      titulo: "Llamadas",
      preguntas: [
        "¿Cuántas llamadas hacen al día?",
        "¿Para qué llaman?",
        "¿Qué llamadas se podrían automatizar o preparar?",
        "¿Les serviría que un agente intente contactar y conecte con un vendedor?",
      ],
    },
    {
      bloque_id: "riesgo_aprobacion",
      titulo: "Riesgo y aprobación",
      preguntas: [
        "¿Qué puede hacer el agente solo?",
        "¿Qué debe aprobar un humano?",
        "¿Qué nunca debe prometer?",
        "¿Cuándo debe escalar?",
      ],
    },
  ],
};

export function get_discovery_interview() {
  return discovery_interview;
}
