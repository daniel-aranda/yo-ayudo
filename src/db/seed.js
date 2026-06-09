import pg from "pg";
import { config } from "../app/config.js";
import { upsert_account as upsert_account_record } from "../accounts/account_repository.js";
import { assign_bot_to_whatsapp_phone_number } from "../bots/bot_assignment_repository.js";
import { upsert_bot as upsert_bot_record } from "../bots/bot_repository.js";
import { upsert_whatsapp_phone_number } from "../channels/whatsapp/whatsapp_number_repository.js";
import { logger } from "../shared/logger.js";
import { is_entrypoint } from "../shared/entrypoint.js";
import { memory_document_service } from "../memory/memory_document_service.js";

const yoayudo_sales_knowledge = `
# YoAyudo - Knowledge para vendedores

## Qué es YoAyudo

YoAyudo ayuda a negocios a ordenar, automatizar y mejorar procesos comerciales y operativos usando WhatsApp como interfaz principal.
No vendemos un bot genérico: vendemos una forma más simple de operar ventas, seguimiento, tareas, diagnósticos y procesos reales desde donde el equipo ya trabaja.

## Problema que resolvemos

Muchas empresas ya venden, atienden y coordinan por WhatsApp, pero lo hacen de forma desordenada:

- Prospectos sin seguimiento.
- Clientes olvidados.
- Vendedores que no registran avances.
- Información perdida en chats.
- Operaciones manuales y repetitivas.
- Dueños sin visibilidad clara de qué está pasando.
- CRMs o sistemas que no se actualizan porque están fuera del flujo diario.

YoAyudo convierte WhatsApp en una capa inteligente de trabajo: captura datos, crea tareas, registra notas, genera resúmenes, consulta knowledge, escala a humanos y se prepara para conectar con herramientas externas mediante APIs.

## Casos de uso principales

### Ventas por WhatsApp

El sistema ayuda a registrar leads, clasificar prospectos, detectar interesados, sugerir próximos pasos, crear tareas de seguimiento y evitar que se pierdan oportunidades.
El objetivo es vender más sin depender de memoria, notas sueltas o chats desordenados.

### Lead tracking

YoAyudo puede dar seguimiento a prospectos desde primer contacto hasta cierre o descarte.
Estados útiles: nuevo prospecto, contactado, interesado, cotización enviada, seguimiento pendiente, caliente, cerrado ganado, cerrado perdido, no interesado o recontactar después.
También puede registrar razones de pérdida, objeciones frecuentes y señales de intención.

### CRM basado en WhatsApp

En vez de obligar al equipo a entrar a un CRM pesado, YoAyudo permite capturar y consultar información desde WhatsApp:

- "Registra que Juan pidió cotización de 20 unidades."
- "Pon a María como prospecto caliente."
- "¿A quién tengo que dar seguimiento hoy?"
- "Muéstrame los leads sin respuesta."
- "Actualiza este cliente como cerrado ganado."

### Notion, Excel, CRM o sistemas existentes

YoAyudo puede funcionar como puente entre WhatsApp y herramientas que el negocio ya usa.
Si existe API o una forma viable de integración, se puede evaluar conexión para crear prospectos, actualizar estados, registrar tareas, guardar notas o consultar información.

### Procesos internos

No todo es ventas. También puede apoyar en registro de gastos, solicitud de documentos, seguimiento de pendientes, reportes diarios, coordinación de equipo, consultas frecuentes y escalamiento humano.

## Cómo explicarlo en una frase

YoAyudo convierte WhatsApp en un sistema inteligente para automatizar ventas, seguimiento y procesos internos conectándose con las herramientas que la empresa ya usa.

## Elevator pitch

Muchas empresas ya trabajan por WhatsApp, pero ahí se les pierden prospectos, tareas y seguimiento. YoAyudo convierte WhatsApp en una herramienta inteligente: registra leads, da seguimiento, conecta con CRMs, Notion o APIs, y ayuda al equipo a operar sin depender de memoria o procesos manuales.

## Qué NO somos

YoAyudo no es simplemente un chatbot de respuestas automáticas.
No somos un bot genérico de FAQs, un CRM tradicional pesado, una herramienta de spam masivo, una solución rígida de flujos cerrados ni un reemplazo total del equipo humano.

Somos una capa de automatización sobre WhatsApp que ayuda al negocio a trabajar mejor.

## Diferenciador

Trabajamos sobre el canal donde muchos negocios ya operan: WhatsApp.
En lugar de pedirle al equipo que cambie completamente de herramienta, llevamos automatización, seguimiento y conectividad al flujo natural de trabajo.
Eso reduce fricción y mejora adopción.

## Beneficios

- Más ventas: mejor seguimiento y menos oportunidades perdidas.
- Más orden: información fuera de chats sueltos.
- Más visibilidad: dueños y gerentes pueden ver clientes, leads y tareas.
- Menos trabajo repetitivo: el sistema registra, recuerda, consulta y actualiza.
- Mejor adopción: el equipo usa WhatsApp, una herramienta que ya conoce.
- Mejor conexión entre sistemas: WhatsApp puede conectarse con APIs, Notion, CRM, bases de datos u otras herramientas.

## Clientes ideales

Buenos candidatos suelen vender por WhatsApp, recibir leads por redes sociales o referidos, tener vendedores con seguimiento manual, perder prospectos por falta de orden, usar Notion/Excel/CRM sin disciplina de actualización, necesitar automatizar tareas repetitivas o querer más visibilidad operativa.

Tipos de negocios: agencias, clínicas, inmobiliarias, escuelas, cursos, servicios profesionales, talleres, constructoras, despachos, consultorios, ecommerce consultivo, empresas B2B y negocios locales con alto volumen de mensajes.

## Preguntas de descubrimiento

- ¿Cómo dan seguimiento hoy a sus prospectos?
- ¿Dónde registran los leads que llegan por WhatsApp?
- ¿Qué pasa cuando un vendedor olvida responder?
- ¿Cómo sabe el dueño qué prospectos están calientes?
- ¿Cuántas oportunidades se pierden por falta de seguimiento?
- ¿Usan CRM, Notion, Excel, ERP o Google Sheets? ¿El equipo realmente los actualiza?
- ¿Qué información repiten todos los días?
- ¿Qué proceso les quita más tiempo cada semana?
- ¿Qué tareas dependen demasiado de una persona?
- ¿Cuándo debe intervenir un humano?

## Señales de buen prospecto

- "Todo lo manejamos por WhatsApp."
- "Se nos pierden clientes."
- "Los vendedores no actualizan el CRM."
- "Tenemos muchos mensajes."
- "Damos seguimiento manual."
- "Usamos Notion, pero nadie lo mantiene al día."
- "El dueño quiere reportes."
- "Necesitamos ordenar ventas."
- "Tenemos procesos repetitivos."

## Señales de mal prospecto

Puede no ser buen candidato si no usa WhatsApp, tiene muy bajo volumen, no tiene proceso repetible, solo quiere un bot barato que conteste todo, busca spam masivo sin estrategia o no quiere invertir tiempo en definir procesos.

## Cómo venderlo

La venta debe enfocarse en dolor real, no en tecnología.
No iniciar con "tenemos bots con IA conectados a APIs".
Mejor decir: "Vamos a ayudarte a que ningún prospecto se pierda, que tus vendedores sepan a quién seguir y que puedas ver el avance desde WhatsApp sin depender de memoria o chats desordenados."

## Objeciones frecuentes

"Ya usamos WhatsApp normal": justamente por eso sirve; no quitamos WhatsApp, lo hacemos más ordenado, medible y automatizado.

"Ya tenemos CRM": YoAyudo puede ser la capa de captura y consulta desde WhatsApp para que el CRM sí se alimente.

"No queremos reemplazar vendedores": buscamos ayudarlos a dar mejor seguimiento, registrar avances y enfocarse en cerrar.

"¿Es solo un bot?": no. Puede incluir bots, pero el valor está en automatizar procesos completos: seguimiento, registro, consultas, escalamiento e integraciones.

"¿Puede conectarse con mi sistema?": si el sistema tiene API o forma viable de integración, se revisa técnicamente.

## Qué prometer

Se puede prometer automatización sobre WhatsApp, organización de leads, seguimiento más consistente, configuración personalizada, reducción de tareas repetitivas, mejor visibilidad y conexión con herramientas externas cuando sea técnicamente posible.

## Qué NO prometer

No prometer que la IA nunca se equivoca, que cerrará ventas sin esfuerzo humano, que cualquier integración es inmediata, que reemplaza al equipo, que se puede hacer spam masivo o que WhatsApp permite cualquier automatización sin reglas.

## Forma correcta de hablar de IA

La IA ayuda a interpretar conversaciones, clasificar información, sugerir acciones y ejecutar procesos definidos. No es magia. El negocio conserva reglas, límites y escalamiento humano.

## Interacciones importantes

Enviar mensajes de WhatsApp permite dar seguimiento, recordar citas, pedir datos faltantes, confirmar recepción, notificar avances o avisar a vendedores. Debe usarse con contexto y reglas, no para spam.

Recibir mensajes de WhatsApp permite interpretar mensajes entrantes, registrar datos, atender consultas y decidir si debe actuar o ignorar según reglas.

Consultar humano permite pedir criterio cuando falta información, hay excepciones, aprobaciones, casos complejos o información que no existe en el knowledge.

## Flujo ejemplo de ventas

1. Entra un lead por WhatsApp.
2. YoAyudo registra el prospecto.
3. Identifica interés, producto o necesidad.
4. Se asigna o notifica a un vendedor.
5. El vendedor conversa con el prospecto.
6. YoAyudo registra avances relevantes.
7. Recuerda seguimientos pendientes.
8. Prioriza prospectos calientes.
9. Marca ganado o perdido.
10. La empresa obtiene visibilidad del proceso.

## Tono de venta

Claro, consultivo y práctico. Primero entender proceso y dolor. Después explicar cómo YoAyudo ayuda. La conversación debe sentirse como diagnóstico, no como demo forzada.

## Cierre diagnóstico

"Si pudiéramos automatizar una parte de tu operación por WhatsApp para ahorrar tiempo o vender más, ¿qué proceso sería el primero que te gustaría arreglar?"

## Principio central

No automatizamos por automatizar. Primero entendemos el proceso, luego diseñamos una solución simple, útil y medible.
`.trim();

const yoayudo_sales_knowledge_description =
  "Guía comercial para vendedores internos de YoAyudo: qué vendemos, dolores que resolvemos, casos de uso, objeciones, límites de promesa y preguntas de descubrimiento.";

async function ensure_seed_schema(pool) {
  await pool.query("ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS summary text");
  await pool.query("ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS quick_facts jsonb NOT NULL DEFAULT '[]'::jsonb");
  await pool.query("ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS summary_status text NOT NULL DEFAULT 'draft'");
  await pool.query("ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS last_summarized_at timestamptz");
  await pool.query("ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS origin text");
  await pool.query("ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb");
  await pool.query("ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS source_family text NOT NULL DEFAULT 'business_knowledge'");
  await pool.query("ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE");
  await pool.query("ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE");
  await pool.query("ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES bots(id) ON DELETE CASCADE");
}

async function upsert_solution_template(pool) {
  const result = await pool.query(
    `
      INSERT INTO solution_templates (
        key,
        name,
        description,
        default_intents_json,
        default_fields_json,
        default_reports_json,
        default_messages_json,
        status
      )
      VALUES (
        'yoayudo_agent_engine',
        'YoAyudo Agent Engine',
        'Configuración base para bots y agentes de WhatsApp por account.',
        $1::jsonb,
        $2::jsonb,
        $3::jsonb,
        $4::jsonb,
        'active'
      )
      ON CONFLICT (key)
      DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        default_intents_json = EXCLUDED.default_intents_json,
        default_fields_json = EXCLUDED.default_fields_json,
        default_reports_json = EXCLUDED.default_reports_json,
        default_messages_json = EXCLUDED.default_messages_json,
        updated_at = now()
      RETURNING id
    `,
    [
      JSON.stringify([
        "day_start",
        "sales_update",
        "purchase",
        "inventory_update",
        "daily_close",
        "daily_note",
        "report_request",
        "human_help",
      ]),
      JSON.stringify({
        purchase: ["item_name", "quantity", "unit", "total_cost", "supplier_name_raw"],
        daily_close: ["total_sales", "cash_sales", "card_sales", "transfer_sales"],
      }),
      JSON.stringify(["daily_operation_summary"]),
      JSON.stringify({
        purchase: "Compra registrada: {{quantity}} {{unit}} de {{item_name}} por {{total_cost}}.",
      }),
    ],
  );

  return result.rows[0].id;
}

async function upsert_bot_profile(pool, account_id, organization_id, solution_template_id) {
  const existing = await pool.query(
    "SELECT id FROM bot_profiles WHERE account_id = $1 AND name = 'YoAyudo Engine Profile' LIMIT 1",
    [account_id],
  );

  let bot_profile_id = existing.rows[0]?.id;

  if (!bot_profile_id) {
    const inserted = await pool.query(
      `
        INSERT INTO bot_profiles (
          account_id,
          organization_id,
          name,
          solution_template_id,
          language,
          timezone,
          settings_json,
          status
        )
        VALUES ($1, $2, 'YoAyudo Engine Profile', $3, 'es-MX', 'America/Mexico_City', '{}'::jsonb, 'active')
        RETURNING id
      `,
      [account_id, organization_id, solution_template_id],
    );
    bot_profile_id = inserted.rows[0].id;
  }

  for (const intent_key of [
    "day_start",
    "sales_update",
    "purchase",
    "inventory_update",
    "daily_close",
    "daily_note",
    "report_request",
    "human_help",
    "unknown",
  ]) {
    await pool.query(
      `
        INSERT INTO bot_intents (
          bot_profile_id,
          intent_key,
          enabled,
          extraction_schema_json,
          examples_json,
          response_templates_json
        )
        VALUES ($1, $2, true, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb)
        ON CONFLICT (bot_profile_id, intent_key)
        DO UPDATE SET enabled = true, updated_at = now()
      `,
      [bot_profile_id, intent_key],
    );
  }

  return bot_profile_id;
}

async function upsert_organization(pool) {
  await pool.query(
    `
      UPDATE organizations
      SET status = 'archived', updated_at = now()
      WHERE slug = 'yoayudo'
    `,
  );

  const result = await pool.query(
    `
      INSERT INTO organizations (name, slug, status)
      VALUES ('YoAyudo Demo', 'yoayudo-demo', 'active')
      ON CONFLICT (slug)
      DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, updated_at = now()
      RETURNING id
    `,
  );

  return result.rows[0].id;
}

async function archive_legacy_demo_entities(pool, organization_id) {
  await pool.query(
    `
      UPDATE accounts
      SET status = 'archived', updated_at = now()
      WHERE organization_id = $1
        AND slug IN ('demo-account', 'cuenta-principal')
    `,
    [organization_id],
  );
  await pool.query(
    `
      UPDATE bots
      SET status = 'archived', updated_at = now()
      WHERE slug IN ('margen-sabroso-bot', 'bot-ventas-clinica-dental')
         OR name IN ('Margen Sabroso Bot', 'Bot Ventas Clínica Dental')
    `,
  );
}

async function upsert_account(pool, organization_id) {
  const existing = await pool.query(
    `
      SELECT *
      FROM accounts
      WHERE organization_id = $1 AND slug = 'yoayudo-ventas'
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [organization_id],
  );

  if (existing.rows[0]) {
    const updated = await pool.query(
      `
        UPDATE accounts
        SET
          organization_id = $2,
          name = 'YoAyudo Ventas',
          slug = 'yoayudo-ventas',
          status = 'active',
          updated_at = now()
        WHERE id = $1
        RETURNING id
      `,
      [existing.rows[0].id, organization_id],
    );

    return updated.rows[0].id;
  }

  const account = await upsert_account_record(pool, {
    organization_id,
    name: "YoAyudo Ventas",
    slug: "yoayudo-ventas",
    status: "active",
  });

  return account.id;
}

async function upsert_bot(pool, input) {
  // Retire any older "legacy" system bot so it doesn't linger in the demo.
  await pool.query(
    "UPDATE bots SET status = 'archived', updated_at = now() WHERE slug = 'bot-whatsapp-legacy-yoayudo'",
  );

  const bot = await upsert_bot_record(pool, {
    organization_id: input.organization_id,
    account_id: input.account_id,
    bot_profile_id: input.bot_profile_id,
    name: "Bot WhatsApp YoAyudo",
    slug: "bot-whatsapp-yoayudo",
    channel: "whatsapp",
    bot_type: "system",
    status: "active",
    description: "Recibe mensajes de WhatsApp y registra ventas, compras, inventario y el cierre del día del negocio.",
    definition_json: {
      identity: {
        name: "Bot WhatsApp YoAyudo",
        description: "Recibe mensajes de WhatsApp y registra la operación diaria del negocio.",
        goal: "Registrar ventas, compras, inventario y el cierre del día a partir de mensajes de WhatsApp, y confirmar cada registro.",
        status: "active",
        type: "system",
      },
      behavior: {
        language: "es-MX",
        tone: "friendly",
        operating_instructions:
          "Recibe mensajes del dueño o encargado por WhatsApp y registra ventas, compras, inventario y cierre del día. Confirma cada registro de forma breve y clara. Si falta un dato clave (por ejemplo el monto), pídelo. Si el mensaje no es una operación, no registres nada.",
        constraints:
          "No inventes montos ni datos.\nNo registres nada si el mensaje no es una operación.\nConfirma siempre lo que registraste.",
      },
      ai: {
        provider: "openai",
        model: config.openai_model,
      },
      knowledge_source_ids: [],
      interactions: [
        {
          key: "receive_whatsapp_message",
          type: "receive_whatsapp_message",
          label: "Recibir mensajes de WhatsApp",
          enabled: true,
          instructions: "Recibe mensajes de operación (ventas, compras, inventario, cierre) y clasifícalos para registrarlos.",
        },
        {
          key: "send_whatsapp_message",
          type: "send_whatsapp_message",
          label: "Enviar mensaje de WhatsApp",
          enabled: true,
          instructions: "Responde una confirmación breve de lo registrado, o pide el dato que falte.",
        },
      ],
    },
    definition_version: 1,
    settings_json: { source: "seed", purpose: "operational_whatsapp" },
  });

  await pool.query("UPDATE conversations SET bot_id = $1 WHERE account_id = $2 AND bot_id IS NULL", [
    bot.id,
    input.account_id,
  ]);
  await pool.query("UPDATE messages SET bot_id = $1 WHERE account_id = $2 AND bot_id IS NULL", [bot.id, input.account_id]);
  await pool.query("UPDATE agent_runs SET bot_id = $1 WHERE account_id = $2 AND bot_id IS NULL", [
    bot.id,
    input.account_id,
  ]);
  await pool.query("UPDATE memory_documents SET bot_id = $1 WHERE account_id = $2 AND bot_id IS NULL", [
    bot.id,
    input.account_id,
  ]);
  await pool.query("UPDATE review_items SET bot_id = $1 WHERE account_id = $2 AND bot_id IS NULL", [
    bot.id,
    input.account_id,
  ]);

  return bot.id;
}

async function upsert_yoayudo_commercial_operator_bot(pool, input) {
  const operating_instructions =
    "Ayuda a los vendedores con dudas sobre YoAyudo. Responde con claridad. Si falta contexto, pregunta. Si la respuesta requiere conocimiento de planes, pricing, integraciones o capacidades, usa el knowledge asignado. No inventes capacidades. Si algo requiere desarrollo custom o no está soportado, explícalo y consulta a un humano cuando aplique.";
  const constraints =
    "No inventar capacidades no disponibles.\nNo fingir que ejecutó acciones externas.\nNo prometer integraciones no configuradas.\nConsultar humano cuando falte knowledge o exista riesgo sensible.";
  const interactions = [
    {
      key: "receive_whatsapp_message",
      type: "receive_whatsapp_message",
      label: "Recibir mensajes de WhatsApp",
      enabled: true,
      instructions:
        "Atiende mensajes de vendedores relacionados con dudas sobre YoAyudo, capacidades, integraciones, pricing o estrategia comercial. Ignora mensajes que no requieran acción o respuesta.",
      options: { read_attachments: true },
    },
    {
      key: "send_whatsapp_message",
      type: "send_whatsapp_message",
      label: "Enviar mensaje de WhatsApp",
      enabled: true,
      instructions: "Envía respuestas breves, claras y útiles. No prometas acciones externas ni integraciones no configuradas.",
    },
    {
      key: "consult_human",
      type: "consult_human",
      label: "Consultar humano",
      enabled: true,
      instructions:
        "Consulta a un humano cuando el knowledge no tenga información suficiente, cuando exista riesgo sensible o cuando el vendedor pregunte por un alcance custom.",
      human_group_ids: [],
    },
    {
      key: "buscar_negocios",
      type: "buscar_negocios",
      label: "Buscar negocios",
      enabled: true,
      action_id: "buscar_negocios",
      instructions:
        "Úsalo para prospectar clientes potenciales. Busca negocios por giro y zona, prioriza (cherry-pick) los que mejor encajen con el perfil ideal, y excluye los que ya fueron contactados antes de proponerlos. Guarda los prospectos relevantes como nota para darles seguimiento.",
    },
    {
      key: "guardar_nota",
      type: "guardar_nota",
      label: "Guardar nota",
      enabled: true,
      action_id: "guardar_nota",
      instructions:
        "Guarda como nota el contexto comercial relevante de cada prospecto: cómo llegó, qué necesita y cualquier dato útil para el seguimiento.",
    },
    {
      key: "crear_tarea",
      type: "crear_tarea",
      label: "Crear tarea",
      enabled: true,
      action_id: "crear_tarea",
      instructions:
        "Crea tareas de seguimiento cuando se acuerde un próximo paso (una llamada, un envío de información o un recordatorio). Incluye qué hay que hacer y para cuándo.",
    },
    {
      key: "generar_resumen",
      type: "generar_resumen",
      label: "Generar resumen",
      enabled: true,
      action_id: "generar_resumen",
      instructions:
        "Genera un resumen operativo cuando el vendedor lo pida o al cerrar una conversación: puntos clave, datos del prospecto y próximos pasos.",
    },
  ];
  const bot = await upsert_bot_record(pool, {
    organization_id: input.organization_id,
    account_id: input.account_id,
    name: "Agente WhatsApp YoAyudo",
    slug: "agente-whatsapp-yoayudo",
    channel: "whatsapp",
    bot_type: "custom",
    status: "active",
    description: "Agente base para resolver dudas de vendedores sobre YoAyudo.",
    settings_json: {
      source: "seed",
      purpose: "founder_preflight",
      future_actions: ["enviar_email", "extraer_datos_de_imagen", "programar_llamada", "llamar_y_conectar"],
      prospecting_providers: ["google_places", "yelp_fusion", "serpapi_google_local"],
    },
    definition_json: {
      identity: {
        name: "Agente WhatsApp YoAyudo",
        description: "Agente base para resolver dudas de vendedores sobre YoAyudo.",
        goal:
          "Ayudar a vendedores a entender YoAyudo, resolver dudas sobre la plataforma, explicar capacidades y guiarlos para cerrar mejor.",
        status: "active",
        type: "custom",
      },
      behavior: {
        language: "es-MX",
        tone: "commercial",
        operating_instructions,
        constraints,
      },
      ai: {
        provider: "openai",
        model: config.openai_model,
      },
      knowledge_source_ids: input.knowledge_source_ids ?? [],
      interactions,
    },
    definition_version: 1,
    paquete_id: null,
    prompt_base: null,
    instrucciones_operativas: operating_instructions,
    tono: "commercial",
    objetivos_json: [
      "Registrar prospectos y contexto comercial.",
      "Crear tareas de seguimiento.",
      "Generar resúmenes operativos.",
      "Detectar acciones o integraciones faltantes para roadmap.",
    ],
    knowledge_base_ids_json: input.knowledge_source_ids ?? [],
    acciones_habilitadas_json: ["buscar_negocios", "guardar_nota", "crear_tarea", "generar_resumen"],
    enabled_actions_json: ["buscar_negocios", "guardar_nota", "crear_tarea", "generar_resumen"],
    reglas_guardrail_json: [
      "No ejecutar acciones no habilitadas.",
      "No fingir integraciones externas.",
      "Registrar guardrail cuando el proveedor no esté configurado.",
      "Buscar prospectos solo con proveedores API configurados y respetando permisos.",
    ],
    reglas_escalamiento_json: [
      "Escalar si el founder pide enviar email real.",
      "Escalar si pide OCR real sobre documentos.",
      "Escalar si pide llamada o conexión telefónica real.",
    ],
    campos_requeridos_json: ["negocio_nombre", "interes", "siguiente_accion"],
    memoria_habilitada: true,
  });

  return bot.id;
}

async function upsert_contact(pool, account_id, organization_id) {
  await pool.query(
    `
      INSERT INTO contacts (account_id, organization_id, whatsapp_phone, display_name, role_label, metadata_json)
      VALUES ($1, $2, '5215550000000', 'Operador Demo', 'encargado', '{}'::jsonb)
      ON CONFLICT (account_id, whatsapp_phone)
      DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        display_name = EXCLUDED.display_name,
        role_label = EXCLUDED.role_label,
        updated_at = now()
    `,
    [account_id, organization_id],
  );
}

async function upsert_whatsapp_number(pool, input) {
  return upsert_whatsapp_phone_number(pool, {
    organization_id: input.organization_id,
    account_id: input.account_id,
    phone_number_id: input.phone_number_id ?? config.whatsapp_phone_number_id,
    display_phone_number: input.display_phone_number ?? "+525555999999",
    status: input.status ?? "active",
  });
}

function lead_capture_bot_definition() {
  return {
    identity: {
      name: "Agente de Prospectos",
      description: "Califica prospectos, captura datos iniciales y consulta a humano en conversaciones sensibles.",
      goal: "Capturar prospectos, entender su necesidad, explicar siguientes pasos y consultar a humano cuando aplique.",
      status: "active",
      type: "custom",
    },
    behavior: {
      language: "es-MX",
      tone: "friendly",
      operating_instructions:
        "Atiende prospectos con mensajes claros y breves. Pregunta nombre, teléfono y necesidad principal cuando falten. Usa knowledge asignado para explicar servicios o siguientes pasos. Consulta a humano si preguntan por financiamiento, urgencias, excepciones o acciones no conectadas.",
      constraints:
        "No prometer acciones externas no configuradas.\nNo prometer precios finales sin validación.\nConsultar humano ante urgencias, financiamiento o excepciones comerciales.",
    },
    ai: {
      provider: "openai",
      model: config.openai_model,
    },
    knowledge_source_ids: [],
    interactions: [
      {
        key: "receive_whatsapp_message",
        type: "receive_whatsapp_message",
        label: "Recibir mensajes de WhatsApp",
        enabled: true,
        instructions: "Atiende mensajes de prospectos interesados en servicios, citas, precios o seguimiento.",
      },
      {
        key: "send_whatsapp_message",
        type: "send_whatsapp_message",
        label: "Enviar mensaje de WhatsApp",
        enabled: true,
        instructions: "Envía respuestas cortas, útiles y orientadas al siguiente paso comercial.",
      },
      {
        key: "consult_human",
        type: "consult_human",
        label: "Consultar humano",
        enabled: true,
        instructions: "Consulta a humano si el prospecto pide financiamiento, una excepción, urgencia o hablar con una persona.",
        human_group_ids: [],
      },
      {
        key: "buscar_negocios",
        type: "buscar_negocios",
        label: "Buscar negocios",
        enabled: true,
        action_id: "buscar_negocios",
        instructions:
          "Úsalo para prospectar. Busca negocios por giro y zona, prioriza (cherry-pick) los que mejor encajen con el cliente ideal y excluye los que ya fueron contactados. Guarda los prospectos relevantes para darles seguimiento.",
      },
      {
        key: "guardar_nota",
        type: "guardar_nota",
        label: "Guardar nota",
        enabled: true,
        action_id: "guardar_nota",
        instructions: "Guarda el contexto de cada prospecto: cómo llegó, qué busca y datos útiles para el seguimiento.",
      },
      {
        key: "crear_tarea",
        type: "crear_tarea",
        label: "Crear tarea",
        enabled: true,
        action_id: "crear_tarea",
        instructions: "Crea tareas de seguimiento cuando se acuerde un próximo paso. Incluye qué hacer y para cuándo.",
      },
      {
        key: "generar_resumen",
        type: "generar_resumen",
        label: "Generar resumen",
        enabled: true,
        action_id: "generar_resumen",
        instructions: "Genera un resumen con los puntos clave, los datos del prospecto y los próximos pasos.",
      },
    ],
  };
}

async function upsert_business_settings(pool, account_id, organization_id) {
  const existing = await pool.query(
    "SELECT id FROM business_settings WHERE account_id = $1 LIMIT 1",
    [account_id],
  );

  if (existing.rows[0]) {
    return;
  }

  await pool.query(
    `
      INSERT INTO business_settings (
        account_id,
        organization_id,
        opening_days_json,
        opening_hours_json,
        strong_days_json,
        weak_days_json,
        monthly_rent,
        average_electricity,
        average_water,
        average_gas,
        other_fixed_costs_json
      )
      VALUES (
        $1,
        $2,
        '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]'::jsonb,
        '{"open":"13:00","close":"23:00"}'::jsonb,
        '["friday","saturday","sunday"]'::jsonb,
        '["monday","tuesday"]'::jsonb,
        18000,
        3500,
        900,
        6200,
        '{"internet": 600}'::jsonb
      )
    `,
    [account_id, organization_id],
  );
}

async function insert_named_rows(pool, table, account_id, organization_id, rows) {
  for (const row of rows) {
    const existing = await pool.query(
      `SELECT id FROM ${table} WHERE account_id = $1 AND name = $2 LIMIT 1`,
      [account_id, row.name],
    );

    if (existing.rows[0]) {
      continue;
    }

    const keys = Object.keys(row);
    const values = Object.values(row);
    const placeholders = values.map((_, index) => `$${index + 3}`).join(", ");

    await pool.query(
      `
        INSERT INTO ${table} (account_id, organization_id, ${keys.join(", ")})
        VALUES ($1, $2, ${placeholders})
      `,
      [account_id, organization_id, ...values],
    );
  }
}

async function upsert_agent_profile(pool, input) {
  const existing = await pool.query(
    `
      SELECT id
      FROM agent_profiles
      WHERE key = $1
        AND COALESCE(solution_template_id::text, '') = COALESCE($2::text, '')
        AND COALESCE(bot_profile_id::text, '') = COALESCE($3::text, '')
      LIMIT 1
    `,
    [
      input.key,
      input.solution_template_id ?? null,
      input.bot_profile_id ?? null,
    ],
  );

  if (existing.rows[0]) {
    await pool.query(
      `
        UPDATE agent_profiles
        SET
          name = $2,
          description = $3,
          agent_type = $4,
          scope = $5,
          system_instructions = $6,
          allowed_intents_json = $7::jsonb,
          allowed_tools_json = $8::jsonb,
          retrieval_config_json = $9::jsonb,
          status = 'active',
          updated_at = now()
        WHERE id = $1
      `,
      [
        existing.rows[0].id,
        input.name,
        input.description,
        input.agent_type,
        input.scope,
        input.system_instructions,
        JSON.stringify(input.allowed_intents_json ?? []),
        JSON.stringify(input.allowed_tools_json ?? []),
        JSON.stringify(input.retrieval_config_json ?? {}),
      ],
    );

    return existing.rows[0].id;
  }

  const inserted = await pool.query(
    `
      INSERT INTO agent_profiles (
        key,
        name,
        description,
        agent_type,
        scope,
        solution_template_id,
        bot_profile_id,
        system_instructions,
        allowed_intents_json,
        allowed_tools_json,
        retrieval_config_json,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, 'active')
      RETURNING id
    `,
    [
      input.key,
      input.name,
      input.description,
      input.agent_type,
      input.scope,
      input.solution_template_id ?? null,
      input.bot_profile_id ?? null,
      input.system_instructions,
      JSON.stringify(input.allowed_intents_json ?? []),
      JSON.stringify(input.allowed_tools_json ?? []),
      JSON.stringify(input.retrieval_config_json ?? {}),
    ],
  );

  return inserted.rows[0].id;
}

async function upsert_routing_rule(pool, input) {
  const existing = await pool.query(
    `
      SELECT id
      FROM agent_routing_rules
      WHERE COALESCE(intent_key, '') = COALESCE($1, '')
        AND agent_profile_id = $2
        AND COALESCE(solution_template_id::text, '') = COALESCE($3::text, '')
        AND COALESCE(bot_profile_id::text, '') = COALESCE($4::text, '')
      LIMIT 1
    `,
    [
      input.intent_key ?? null,
      input.agent_profile_id,
      input.solution_template_id ?? null,
      input.bot_profile_id ?? null,
    ],
  );

  if (existing.rows[0]) {
    await pool.query(
      `
        UPDATE agent_routing_rules
        SET priority = $2, condition_json = $3::jsonb, enabled = true, updated_at = now()
        WHERE id = $1
      `,
      [existing.rows[0].id, input.priority, JSON.stringify(input.condition_json ?? {})],
    );
    return existing.rows[0].id;
  }

  const inserted = await pool.query(
    `
      INSERT INTO agent_routing_rules (
        solution_template_id,
        bot_profile_id,
        priority,
        intent_key,
        agent_profile_id,
        condition_json,
        enabled
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, true)
      RETURNING id
    `,
    [
      input.solution_template_id ?? null,
      input.bot_profile_id ?? null,
      input.priority ?? 100,
      input.intent_key ?? null,
      input.agent_profile_id,
      JSON.stringify(input.condition_json ?? {}),
    ],
  );

  return inserted.rows[0].id;
}

async function seed_agent_profiles(pool, solution_template_id, bot_profile_id) {
  const agents = [
    { key: "operations_agent", intents: ["day_start", "daily_close", "daily_note"] },
    { key: "sales_agent", intents: ["sales_update"] },
    { key: "inventory_agent", intents: ["inventory_update"] },
    { key: "purchases_agent", intents: ["purchase"] },
    { key: "reports_agent", intents: ["report_request"] },
    { key: "support_agent", intents: [] },
    { key: "human_handoff_agent", intents: ["human_help"] },
    { key: "unknown_agent", intents: ["unknown"] },
  ];
  const profile_ids = new Map();

  for (const agent of agents) {
    const agent_profile_id = await upsert_agent_profile(pool, {
      key: agent.key,
      name: agent.key.replace(/_/g, " "),
      description: `Subagente generico ${agent.key}.`,
      agent_type: agent.key,
      scope: "solution_template",
      solution_template_id,
      system_instructions: "Delegar en handlers operativos existentes y no inventar hechos.",
      allowed_intents_json: agent.intents,
      allowed_tools_json: ["operation_handlers"],
      retrieval_config_json: { scopes: ["account", "conversation", "operational_day"] },
    });
    profile_ids.set(agent.key, agent_profile_id);
  }

  const routing_map = {
    purchase: "purchases_agent",
    sales_update: "sales_agent",
    inventory_update: "inventory_agent",
    day_start: "operations_agent",
    daily_close: "operations_agent",
    daily_note: "operations_agent",
    report_request: "reports_agent",
    human_help: "human_handoff_agent",
    unknown: "unknown_agent",
  };

  for (const [intent_key, agent_key] of Object.entries(routing_map)) {
    await upsert_routing_rule(pool, {
      solution_template_id,
      bot_profile_id,
      priority: 10,
      intent_key,
      agent_profile_id: profile_ids.get(agent_key),
    });
  }
}

async function upsert_knowledge_source(pool, input) {
  const existing = await pool.query(
    `
      SELECT id
      FROM knowledge_sources
      WHERE name = $1
        AND scope = $2
        AND source_type = $3
        AND COALESCE(solution_template_id::text, '') = COALESCE($4::text, '')
      LIMIT 1
    `,
    [
      input.name,
      input.scope,
      input.source_type,
      input.solution_template_id ?? null,
    ],
  );

  if (existing.rows[0]) {
    await pool.query(
      `
        UPDATE knowledge_sources
        SET
          organization_id = COALESCE($2, organization_id),
          account_id = COALESCE($3, account_id),
          bot_id = COALESCE($4, bot_id),
          description = COALESCE($5, description),
          summary = COALESCE($6, summary),
          quick_facts = $7::jsonb,
          summary_status = COALESCE($8, summary_status),
          last_summarized_at = COALESCE($9, last_summarized_at),
          metadata_json = $10::jsonb,
          status = COALESCE($11, status),
          updated_at = now()
        WHERE id = $1
      `,
      [
        existing.rows[0].id,
        input.organization_id ?? null,
        input.account_id ?? null,
        input.bot_id ?? null,
        input.description ?? null,
        input.summary ?? null,
        JSON.stringify(input.quick_facts ?? []),
        input.summary_status ?? null,
        input.last_summarized_at ?? null,
        JSON.stringify(input.metadata_json ?? {}),
        input.status ?? null,
      ],
    );
    return existing.rows[0].id;
  }

  const inserted = await pool.query(
    `
      INSERT INTO knowledge_sources (
        organization_id,
        account_id,
        bot_id,
        solution_template_id,
        bot_profile_id,
        source_family,
        scope,
        source_type,
        name,
        description,
        summary,
        quick_facts,
        summary_status,
        last_summarized_at,
        origin,
        metadata_json,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, COALESCE($13, 'draft'), $14, $15, $16::jsonb, COALESCE($17, 'active'))
      RETURNING id
    `,
    [
      input.organization_id ?? null,
      input.account_id ?? null,
      input.bot_id ?? null,
      input.solution_template_id ?? null,
      input.bot_profile_id ?? null,
      input.source_family ?? "business_knowledge",
      input.scope,
      input.source_type,
      input.name,
      input.description ?? null,
      input.summary ?? null,
      JSON.stringify(input.quick_facts ?? []),
      input.summary_status ?? "draft",
      input.last_summarized_at ?? null,
      input.origin ?? "seed",
      JSON.stringify(input.metadata_json ?? {}),
      input.status ?? "active",
    ],
  );

  return inserted.rows[0].id;
}

async function upsert_yoayudo_sales_knowledge_source(pool, input) {
  return upsert_knowledge_source(pool, {
    organization_id: input.organization_id,
    account_id: input.account_id,
    source_family: "business_knowledge",
    scope: "account",
    source_type: "text",
    name: "YoAyudo account knowledge",
    description: yoayudo_sales_knowledge_description,
    summary: yoayudo_sales_knowledge,
    quick_facts: [
      "YoAyudo usa Bot Engine configurable: el código es motor y los agentes son configuración.",
      "Los agentes pueden tener knowledge sources asignadas, instrucciones operativas, restricciones e interacciones permitidas.",
      "Si una integración no está configurada, el agente no debe fingir que la ejecutó.",
      "Las acciones internas reales actuales incluyen guardar notas, crear tareas y generar resúmenes.",
    ],
    summary_status: "ready",
    last_summarized_at: null,
    origin: "seed",
    metadata_json: { source: "seed_config", purpose: "founder_trial" },
    status: "ready",
  });
}

async function update_legacy_yoayudo_seed_knowledge(pool, input) {
  await pool.query(
    `
      UPDATE knowledge_sources
      SET
        organization_id = COALESCE($1, organization_id),
        account_id = COALESCE($2, account_id),
        source_type = 'text',
        source_family = 'business_knowledge',
        description = $3,
        summary = $4,
        summary_status = 'ready',
        status = CASE WHEN status = 'active' THEN 'ready' ELSE status END,
        metadata_json = metadata_json || $5::jsonb,
        updated_at = now()
      WHERE name = 'YoAyudo account knowledge'
        AND source_type = 'seed_config'
    `,
    [
      input.organization_id,
      input.account_id,
      yoayudo_sales_knowledge_description,
      yoayudo_sales_knowledge,
      JSON.stringify({ migrated_from_source_type: "seed_config", purpose: "founder_trial" }),
    ],
  );
}

async function seed_knowledge_documents(pool, input) {
  const service = new memory_document_service({ pool });
  const knowledge_documents = [
    {
      scope: "global",
      document_family: "system_knowledge",
      document_type: "global_knowledge",
      source_family: "system_knowledge",
      name: "YoAyudo global knowledge",
      content:
        "YoAyudo convierte WhatsApp en un sistema operativo de negocio. El bot debe capturar datos operativos, ejecutar procesos simples, generar reportes y escalar a humano cuando haya incertidumbre.",
    },
    {
      scope: "solution_template",
      document_family: "system_knowledge",
      document_type: "solution_knowledge",
      source_family: "system_knowledge",
      name: "YoAyudo Agent Engine knowledge",
      solution_template_id: input.solution_template_id,
      content:
        "YoAyudo permite configurar bots y agentes por account, conectar canales, registrar conversaciones, ejecutar acciones habilitadas y escalar a humano cuando falte contexto o capacidad.",
    },
    {
      scope: "account",
      document_family: "business_knowledge",
      document_type: "client_knowledge",
      source_family: "business_knowledge",
      name: "YoAyudo account knowledge",
      organization_id: input.organization_id,
      account_id: input.account_id,
      bot_id: input.bot_id,
      bot_profile_id: input.bot_profile_id,
      content: yoayudo_sales_knowledge,
    },
  ];

  for (const document of knowledge_documents) {
    const knowledge_source_id = await upsert_knowledge_source(pool, {
      organization_id: document.organization_id,
      account_id: document.account_id,
      bot_id: document.bot_id,
      solution_template_id: document.solution_template_id,
      bot_profile_id: document.bot_profile_id,
      source_family: document.source_family,
      scope: document.scope,
      source_type: "text",
      name: document.name,
      description:
        document.name === "YoAyudo account knowledge"
          ? yoayudo_sales_knowledge_description
          : "Knowledge operativo de sistema para guiar respuestas, límites y comportamiento base de YoAyudo.",
      summary: document.content,
      summary_status: "ready",
    });

    await service.create_document({
      organization_id: document.organization_id ?? null,
      account_id: document.account_id ?? null,
      bot_id: document.bot_id ?? null,
      solution_template_id: document.solution_template_id ?? null,
      bot_profile_id: document.bot_profile_id ?? null,
      document_family: document.document_family,
      scope: document.scope,
      document_type: document.document_type,
      title: document.name,
      content: document.content,
      source_table: "knowledge_sources",
      source_id: knowledge_source_id,
      metadata_json: {
        source: "seed_config",
        document_family: document.document_family,
        scope: document.scope,
      },
      visibility: "private",
    });
  }
}

async function seed_operational_demo_day(pool, account_id, organization_id) {
  // Demo-only convenience data. Skipped under tests so deterministic pipeline tests
  // start with empty operational tables.
  if (config.node_env === "test") {
    return null;
  }

  const existing = await pool.query(
    "SELECT id FROM op_business_days WHERE account_id = $1 ORDER BY operation_date DESC LIMIT 1",
    [account_id],
  );
  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const day = await pool.query(
    `
      INSERT INTO op_business_days (
        account_id, organization_id, operation_date, status,
        opening_cash, total_sales, cash_sales, card_sales, transfer_sales, closing_cash,
        opened_at, closed_at
      )
      VALUES ($1, $2, CURRENT_DATE, 'closed', 1500, 8500, 3000, 4000, 1500, 4500, now(), now())
      RETURNING id
    `,
    [account_id, organization_id],
  );
  const business_day_id = day.rows[0].id;

  await pool.query(
    `
      INSERT INTO op_purchases (account_id, organization_id, business_day_id, item_name, quantity, unit, total_cost, supplier_name_raw)
      VALUES
        ($1, $2, $3, 'pastor', 12, 'kg', 1680, 'Carnicería Don Juan'),
        ($1, $2, $3, 'tortilla', 20, 'kg', 600, 'Tortillería La Esquina')
    `,
    [account_id, organization_id, business_day_id],
  );

  await pool.query(
    `
      INSERT INTO op_daily_reports (account_id, organization_id, business_day_id, report_date, summary_text, metrics_json, alerts_json, recommendations_json)
      VALUES ($1, $2, $3, CURRENT_DATE, $4, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb)
    `,
    [
      account_id,
      organization_id,
      business_day_id,
      "Ventas del día $8,500 (efectivo $3,000, tarjeta $4,000, transferencia $1,500). Compras $2,280. Caja final $4,500.",
    ],
  );

  return business_day_id;
}

export async function seed_development_data(pool) {
  await ensure_seed_schema(pool);
  const solution_template_id = await upsert_solution_template(pool);
  const organization_id = await upsert_organization(pool);
  await archive_legacy_demo_entities(pool, organization_id);
  const account_id = await upsert_account(pool, organization_id);
  const bot_profile_id = await upsert_bot_profile(pool, account_id, organization_id, solution_template_id);
  await update_legacy_yoayudo_seed_knowledge(pool, { organization_id, account_id });
  const yoayudo_knowledge_source_id = await upsert_yoayudo_sales_knowledge_source(pool, {
    organization_id,
    account_id,
  });
  const bot_id = await upsert_bot(pool, {
    organization_id,
    account_id,
    bot_profile_id,
  });
  const whatsapp_phone_number = await upsert_whatsapp_number(pool, {
    organization_id,
    account_id,
  });
  const prospect_bot_definition = lead_capture_bot_definition();
  const custom_bot = await upsert_bot_record(pool, {
    organization_id,
    account_id,
    name: "Agente de Prospectos",
    slug: "agente-de-prospectos",
    channel: "whatsapp",
    bot_type: "custom",
    status: "active",
    description: prospect_bot_definition.identity.description,
    definition_json: prospect_bot_definition,
    definition_version: 1,
    instrucciones_operativas: prospect_bot_definition.behavior.operating_instructions,
    tono: prospect_bot_definition.behavior.tone,
    reglas_guardrail_json: prospect_bot_definition.behavior.constraints.split("\n"),
    acciones_habilitadas_json: ["buscar_negocios", "guardar_nota", "crear_tarea", "generar_resumen"],
    enabled_actions_json: ["buscar_negocios", "guardar_nota", "crear_tarea", "generar_resumen"],
    settings_json: { source: "seed" },
  });
  const custom_whatsapp_phone_number = await upsert_whatsapp_phone_number(pool, {
    organization_id,
    account_id,
    phone_number_id: "demo-prospectos-phone-number-id",
    display_phone_number: "+525555888888",
    status: "active",
  });
  await assign_bot_to_whatsapp_phone_number(pool, {
    organization_id,
    account_id,
    whatsapp_phone_number_id: custom_whatsapp_phone_number.id,
    bot_id: custom_bot.id,
    metadata_json: { source: "seed", purpose: "custom_bot_demo" },
  });
  const yoayudo_commercial_bot_id = await upsert_yoayudo_commercial_operator_bot(pool, {
    organization_id,
    account_id,
    knowledge_source_ids: [yoayudo_knowledge_source_id],
  });
  await assign_bot_to_whatsapp_phone_number(pool, {
    organization_id,
    account_id,
    whatsapp_phone_number_id: whatsapp_phone_number.id,
    bot_id: yoayudo_commercial_bot_id,
    metadata_json: { source: "seed", purpose: "main_configurable_agent" },
  });

  await upsert_contact(pool, account_id, organization_id);
  await upsert_business_settings(pool, account_id, organization_id);
  await seed_operational_demo_day(pool, account_id, organization_id);

  await insert_named_rows(pool, "catalog_items", account_id, organization_id, [
    { name: "plan starter", category: "planes", price: 0, active: true, metadata_json: "{}" },
    { name: "plan business", category: "planes", price: 0, active: true, metadata_json: "{}" },
  ]);

  await insert_named_rows(pool, "inventory_items", account_id, organization_id, [
    { name: "whatsapp_channel", default_unit: "unidad", category: "canal", approximate_unit_cost: 0, yield_notes: null, active: true },
    { name: "bot_agent", default_unit: "unidad", category: "engine", approximate_unit_cost: 0, yield_notes: null, active: true },
  ]);

  await insert_named_rows(pool, "suppliers", account_id, organization_id, [
    { name: "Proveedor de WhatsApp", contact_name: "Soporte", phone: "+525555111111", notes: "Canal demo" },
  ]);

  await seed_agent_profiles(pool, solution_template_id, bot_profile_id);
  await seed_knowledge_documents(pool, {
    organization_id,
    account_id,
    solution_template_id,
    bot_profile_id,
    bot_id,
  });

  // Archive legacy/empty business-knowledge stubs so the Knowledge Center demo
  // shows only real, populated sources.
  await pool.query(
    `
      UPDATE knowledge_sources
      SET status = 'archived', updated_at = now()
      WHERE source_family = 'business_knowledge'
        AND status = 'active'
        AND (summary IS NULL OR summary = '')
    `,
  );

  // Keep each bot's organization in sync with its account's organization (source of truth).
  await pool.query(
    `
      UPDATE bots
      SET organization_id = accounts.organization_id, updated_at = now()
      FROM accounts
      WHERE accounts.id = bots.account_id
        AND bots.organization_id <> accounts.organization_id
    `,
  );

  logger.info({ organization_id, account_id, bot_id, yoayudo_commercial_bot_id }, "development seed complete");
  return { solution_template_id, bot_profile_id, organization_id, account_id, bot_id, yoayudo_commercial_bot_id };
}

if (is_entrypoint(import.meta.url)) {
  const seed_pool = new pg.Pool({ connectionString: config.database_url });
  seed_development_data(seed_pool)
    .then(async () => {
      await seed_pool.end();
    })
    .catch(async (error) => {
      await seed_pool.end().catch(() => undefined);
      logger.error({ err: error }, "development seed failed");
      process.exit(1);
    });
}
