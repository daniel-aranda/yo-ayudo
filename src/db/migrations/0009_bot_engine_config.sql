ALTER TABLE bots ADD COLUMN IF NOT EXISTS prompt_base text;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS instrucciones_operativas text;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS tono text;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS objetivos_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS knowledge_base_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS acciones_habilitadas_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS reglas_guardrail_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS memoria_habilitada boolean NOT NULL DEFAULT true;

UPDATE bots
SET acciones_habilitadas_json = enabled_actions_json
WHERE acciones_habilitadas_json = '[]'::jsonb
  AND enabled_actions_json <> '[]'::jsonb;

CREATE TABLE IF NOT EXISTS bot_templates (
  template_id text PRIMARY KEY,
  nombre text NOT NULL,
  descripcion text,
  prompt_base text NOT NULL,
  acciones_sugeridas jsonb NOT NULL DEFAULT '[]'::jsonb,
  campos_sugeridos jsonb NOT NULL DEFAULT '[]'::jsonb,
  reglas_guardrail_sugeridas jsonb NOT NULL DEFAULT '[]'::jsonb,
  reglas_escalamiento_sugeridas jsonb NOT NULL DEFAULT '[]'::jsonb,
  knowledge_base_sugerida jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  habilitado boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO bot_templates (
  template_id,
  nombre,
  descripcion,
  prompt_base,
  acciones_sugeridas,
  campos_sugeridos,
  reglas_guardrail_sugeridas,
  reglas_escalamiento_sugeridas,
  knowledge_base_sugerida,
  version,
  habilitado
)
VALUES
  (
    'recepcionista_ai',
    'Recepcionista AI',
    'Template editable para responder preguntas frecuentes, capturar datos y escalar a humano.',
    'Eres un asistente de recepción para un negocio. Responde con base en knowledge autorizado, captura datos básicos y escala cuando no tengas certeza.',
    '["responder_conocimiento","crear_contacto","actualizar_contacto","guardar_nota","solicitar_aprobacion_humana"]'::jsonb,
    '["nombre","telefono","motivo_contacto"]'::jsonb,
    '["No inventar información del negocio.","No prometer precios o disponibilidad si no está en knowledge.","Escalar preguntas sensibles o fuera de alcance."]'::jsonb,
    '["cliente pide humano","queja sensible","pregunta fuera de knowledge"]'::jsonb,
    '["servicios","horarios","ubicaciones","políticas","preguntas frecuentes"]'::jsonb,
    1,
    true
  ),
  (
    'seguimiento_ventas',
    'Seguimiento de ventas',
    'Template editable para calificar prospectos, crear tareas y preparar seguimiento comercial.',
    'Eres un asistente comercial. Identifica prospectos, captura interés, sugiere siguiente acción y crea seguimiento solo con acciones habilitadas.',
    '["crear_contacto","actualizar_contacto","crear_tarea","crear_recordatorio","guardar_nota","generar_resumen"]'::jsonb,
    '["nombre","telefono","interes","presupuesto","fecha_seguimiento"]'::jsonb,
    '["No autorizar descuentos.","No prometer disponibilidad no confirmada.","Escalar compras de alto valor o condiciones especiales."]'::jsonb,
    '["descuento solicitado","cliente molesto","compra de alto valor"]'::jsonb,
    '["servicios","precios","objeciones","criterios de venta","promociones"]'::jsonb,
    1,
    true
  ),
  (
    'agenda_facil',
    'Agenda fácil',
    'Template editable para recibir solicitudes de cita y preparar recordatorios.',
    'Eres un asistente de agenda. Reúne datos de cita, confirma información y solicita aprobación si una acción requiere humano.',
    '["crear_contacto","crear_recordatorio","guardar_nota","solicitar_aprobacion_humana"]'::jsonb,
    '["nombre","telefono","servicio","fecha_preferida","sucursal"]'::jsonb,
    '["No confirmar citas finales sin fuente autorizada.","Escalar cambios urgentes o excepciones."]'::jsonb,
    '["horario no disponible","cambio urgente","cliente VIP"]'::jsonb,
    '["horarios","sucursales","servicios","políticas de cita"]'::jsonb,
    1,
    true
  ),
  (
    'factura_facil',
    'Factura fácil',
    'Template editable para reunir datos fiscales y crear solicitudes internas de facturación.',
    'Eres un asistente de facturación. Reúne datos fiscales, revisa que la solicitud esté completa y crea solicitudes internas usando acciones habilitadas.',
    '["extraer_datos_de_imagen","crear_solicitud_facturacion","validar_datos_fiscales","guardar_nota","guardar_archivo"]'::jsonb,
    '["rfc","razon_social","regimen_fiscal","uso_cfdi","correo","monto","ticket"]'::jsonb,
    '["No emitir facturas reales.","No modificar facturas emitidas.","Pedir mejor imagen si el archivo no es legible."]'::jsonb,
    '["datos fiscales incompletos","archivo ilegible","cancelación o modificación de factura emitida"]'::jsonb,
    '["requisitos de facturación","políticas fiscales","correos de encargados"]'::jsonb,
    1,
    true
  ),
  (
    'documentos_facil',
    'Documentos fácil',
    'Template editable para pedir documentos, revisar faltantes y armar checklist.',
    'Eres un asistente documental. Revisa archivos recibidos contra una checklist y registra faltantes sin inventar validaciones.',
    '["guardar_archivo","extraer_datos_de_imagen","revisar_documentos_requeridos","crear_ticket","guardar_nota"]'::jsonb,
    '["nombre","tipo_tramite","documentos_recibidos","documentos_faltantes"]'::jsonb,
    '["No validar documentos sensibles como definitivos.","Escalar inconsistencias o documentos ilegibles."]'::jsonb,
    '["documento sensible","documento ilegible","inconsistencia en datos"]'::jsonb,
    '["documentos requeridos","criterios de validación","formatos aceptados"]'::jsonb,
    1,
    true
  ),
  (
    'cobranza_suave',
    'Cobranza suave',
    'Template editable para recordatorios de pago, promesas de pago y seguimiento cuidadoso.',
    'Eres un asistente de cobranza cuidadoso. Clasifica respuestas, registra promesas de pago y escala situaciones sensibles.',
    '["crear_recordatorio","guardar_nota","cambiar_estatus","generar_resumen","solicitar_aprobacion_humana"]'::jsonb,
    '["nombre","monto","fecha_promesa_pago","estatus_pago"]'::jsonb,
    '["No amenazar.","No prometer condonaciones.","Escalar situaciones legales o clientes molestos."]'::jsonb,
    '["cliente molesto","amenaza legal","descuento o convenio"]'::jsonb,
    '["políticas de cobranza","formas de pago","mensajes autorizados"]'::jsonb,
    1,
    true
  )
ON CONFLICT (template_id)
DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  prompt_base = EXCLUDED.prompt_base,
  acciones_sugeridas = EXCLUDED.acciones_sugeridas,
  campos_sugeridos = EXCLUDED.campos_sugeridos,
  reglas_guardrail_sugeridas = EXCLUDED.reglas_guardrail_sugeridas,
  reglas_escalamiento_sugeridas = EXCLUDED.reglas_escalamiento_sugeridas,
  knowledge_base_sugerida = EXCLUDED.knowledge_base_sugerida,
  version = EXCLUDED.version,
  habilitado = EXCLUDED.habilitado,
  updated_at = now();

CREATE TABLE IF NOT EXISTS discovery_questions (
  pregunta_id text PRIMARY KEY,
  bloque text NOT NULL,
  texto text NOT NULL,
  tipo_respuesta text NOT NULL DEFAULT 'texto',
  ayuda text,
  activa boolean NOT NULL DEFAULT true,
  orden integer NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO discovery_questions (pregunta_id, bloque, texto, tipo_respuesta, ayuda, activa, orden, version)
VALUES
  ('llegada_clientes_01', 'llegada_clientes', '¿De dónde llegan tus clientes?', 'texto', 'Canales principales: WhatsApp, llamadas, redes, referidos, sitio web.', true, 10, 1),
  ('llegada_clientes_02', 'llegada_clientes', '¿Cuántos mensajes o llamadas reciben al día?', 'numero_texto', 'Rango aproximado sirve.', true, 20, 1),
  ('llegada_clientes_03', 'llegada_clientes', '¿Quién responde?', 'texto', 'Persona, equipo o dueño.', true, 30, 1),
  ('llegada_clientes_04', 'llegada_clientes', '¿Qué pasa fuera de horario?', 'texto', 'Detectar oportunidades de respuesta automática o seguimiento.', true, 40, 1),
  ('llegada_clientes_05', 'llegada_clientes', '¿Dónde se pierden prospectos?', 'texto', 'Momentos donde dejan de responder o no se da seguimiento.', true, 50, 1),
  ('ventas_01', 'ventas', '¿Cómo cotizan?', 'texto', 'Manual, Excel, catálogo, sistema o criterio humano.', true, 10, 1),
  ('ventas_02', 'ventas', '¿Quién da seguimiento?', 'texto', 'Dueño, vendedor, recepción o nadie fijo.', true, 20, 1),
  ('ventas_03', 'ventas', '¿Cuánto tardan en responder?', 'texto', 'Tiempo promedio de primera respuesta.', true, 30, 1),
  ('ventas_04', 'ventas', '¿Cuántas veces intentan contactar antes de rendirse?', 'texto', 'Frecuencia de seguimiento.', true, 40, 1),
  ('ventas_05', 'ventas', '¿Quién autoriza descuentos?', 'texto', 'Detectar necesidad de aprobación humana.', true, 50, 1),
  ('tareas_repetitivas_01', 'tareas_repetitivas', '¿Qué hacen todos los días que les quita tiempo?', 'texto', null, true, 10, 1),
  ('tareas_repetitivas_02', 'tareas_repetitivas', '¿Qué mensajes copian y pegan?', 'texto', null, true, 20, 1),
  ('tareas_repetitivas_03', 'tareas_repetitivas', '¿Qué información piden siempre?', 'texto', null, true, 30, 1),
  ('tareas_repetitivas_04', 'tareas_repetitivas', '¿Qué se les olvida?', 'texto', null, true, 40, 1),
  ('documentos_y_capturas_01', 'documentos_y_capturas', '¿Reciben PDFs, fotos, tickets, facturas o comprobantes?', 'texto', null, true, 10, 1),
  ('documentos_y_capturas_02', 'documentos_y_capturas', '¿Qué datos necesitan extraer?', 'texto', null, true, 20, 1),
  ('documentos_y_capturas_03', 'documentos_y_capturas', '¿Usan capturas de sistemas?', 'texto', null, true, 30, 1),
  ('documentos_y_capturas_04', 'documentos_y_capturas', '¿Qué documentos deben revisar?', 'texto', null, true, 40, 1),
  ('sistemas_actuales_01', 'sistemas_actuales', '¿Usan Excel, CRM, punto de venta, Google Sheets, sistema administrativo?', 'texto', null, true, 10, 1),
  ('sistemas_actuales_02', 'sistemas_actuales', '¿Hay APIs o todo se maneja manual?', 'texto', null, true, 20, 1),
  ('sistemas_actuales_03', 'sistemas_actuales', '¿Se puede operar con capturas o archivos al inicio?', 'texto', null, true, 30, 1),
  ('llamadas_01', 'llamadas', '¿Cuántas llamadas hacen al día?', 'numero_texto', null, true, 10, 1),
  ('llamadas_02', 'llamadas', '¿Para qué llaman?', 'texto', null, true, 20, 1),
  ('llamadas_03', 'llamadas', '¿Qué llamadas se podrían automatizar o preparar?', 'texto', null, true, 30, 1),
  ('llamadas_04', 'llamadas', '¿Les serviría que un agente intente contactar y conecte con un vendedor?', 'texto', null, true, 40, 1),
  ('riesgo_y_aprobacion_01', 'riesgo_y_aprobacion', '¿Qué puede hacer el agente solo?', 'texto', null, true, 10, 1),
  ('riesgo_y_aprobacion_02', 'riesgo_y_aprobacion', '¿Qué debe aprobar un humano?', 'texto', null, true, 20, 1),
  ('riesgo_y_aprobacion_03', 'riesgo_y_aprobacion', '¿Qué nunca debe prometer?', 'texto', null, true, 30, 1),
  ('riesgo_y_aprobacion_04', 'riesgo_y_aprobacion', '¿Cuándo debe escalar?', 'texto', null, true, 40, 1)
ON CONFLICT (pregunta_id)
DO UPDATE SET
  bloque = EXCLUDED.bloque,
  texto = EXCLUDED.texto,
  tipo_respuesta = EXCLUDED.tipo_respuesta,
  ayuda = EXCLUDED.ayuda,
  activa = EXCLUDED.activa,
  orden = EXCLUDED.orden,
  version = EXCLUDED.version,
  updated_at = now();

CREATE TABLE IF NOT EXISTS bot_prompt_compilations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  bot_id uuid REFERENCES bots(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  prompt_version integer NOT NULL DEFAULT 1,
  acciones_disponibles jsonb NOT NULL DEFAULT '[]'::jsonb,
  knowledge_usado jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_prompt_compilations_bot_idx ON bot_prompt_compilations (bot_id, created_at);
CREATE INDEX IF NOT EXISTS bot_prompt_compilations_conversation_idx ON bot_prompt_compilations (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS bot_guardrail_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  bot_id uuid REFERENCES bots(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  tipo text NOT NULL,
  action_id text,
  accion_sugerida text,
  descripcion text NOT NULL,
  prompt_fragment text,
  input_intentado jsonb,
  severidad text NOT NULL DEFAULT 'media',
  status text NOT NULL DEFAULT 'nuevo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_guardrail_events_bot_idx ON bot_guardrail_events (bot_id, created_at);
CREATE INDEX IF NOT EXISTS bot_guardrail_events_account_idx ON bot_guardrail_events (account_id, created_at);
CREATE INDEX IF NOT EXISTS bot_guardrail_events_tipo_idx ON bot_guardrail_events (tipo, created_at);

ALTER TABLE diagnosticos_ai ADD COLUMN IF NOT EXISTS bots_recomendados jsonb NOT NULL DEFAULT '[]'::jsonb;
