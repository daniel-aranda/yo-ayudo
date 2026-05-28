import { get_account_by_id } from "../accounts/account_repository.js";
import { upsert_bot } from "../bots/bot_repository.js";
import { get_agent_package } from "./agent_package_catalog.js";

function slug_from_name(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function definition_from_package(paquete, input) {
  const default_agent_key = `${paquete.paquete_id}_agent`;

  return {
    name: input.name ?? paquete.nombre,
    description: paquete.descripcion,
    goal: `Operar el paquete ${paquete.nombre}: ${paquete.casos_de_uso.join(", ")}.`,
    supported_intents: paquete.casos_de_uso.map((caso) => slug_from_name(caso).replace(/-/g, "_")),
    required_fields: paquete.campos_recomendados.map((campo) => ({
      key: slug_from_name(campo).replace(/-/g, "_"),
      label: campo,
      description: `Campo recomendado para ${paquete.nombre}.`,
      required: false,
    })),
    agent_definitions: [
      {
        id: default_agent_key,
        key: default_agent_key,
        name: paquete.nombre,
        type: "custom",
        description: paquete.descripcion,
        responsibilities: paquete.casos_de_uso,
        supported_intents: paquete.casos_de_uso.map((caso) => slug_from_name(caso).replace(/-/g, "_")),
        required_fields: [],
        knowledge_scopes: paquete.knowledge_base_sugerida.map((item) => slug_from_name(item).replace(/-/g, "_")),
        handoff_rules: paquete.reglas_de_escalamiento,
        constraints: ["No prometer acciones fuera de las acciones habilitadas.", "Escalar si falta autorizacion humana."],
      },
      {
        id: "human_handoff_agent",
        key: "human_handoff_agent",
        name: "Escalamiento humano",
        type: "system",
        description: "Canaliza casos sensibles o fuera de permisos a una persona.",
        responsibilities: ["handoff", "aprobacion", "casos sensibles"],
        supported_intents: ["human_help"],
        handoff_rules: paquete.reglas_de_escalamiento,
      },
    ],
    routing_config: {
      default_agent_key,
      intent_routes: [],
    },
    handoff_policy: {
      enabled: true,
      triggers: paquete.reglas_de_escalamiento,
      message: "Te canalizo con una persona del equipo para continuar.",
    },
    knowledge_requirements: paquete.knowledge_base_sugerida.map((item) => ({
      key: slug_from_name(item).replace(/-/g, "_"),
      description: `Contenido sugerido: ${item}.`,
      required: false,
    })),
    response_style: {
      tone: "claro, útil y profesional",
      language: "es-MX",
      max_length: 700,
      formatting: "mensajes cortos de WhatsApp",
    },
    constraints: ["No inventar información del negocio.", "Pedir confirmacion humana para acciones sensibles."],
  };
}

export class bot_from_package_service {
  constructor({ pool }) {
    this.pool = pool;
  }

  async create_bot_from_package(input) {
    const paquete = get_agent_package(input.paquete_id);

    if (!paquete) {
      throw new Error(`Paquete no encontrado: ${input.paquete_id}`);
    }

    const account = await get_account_by_id(this.pool, input.account_id);

    if (!account) {
      throw new Error(`Account no encontrado: ${input.account_id}`);
    }

    if (!account.tenant_id) {
      throw new Error("Account necesita tenant_id legacy para crear bot compatible.");
    }

    const definition_json = input.definition_json ?? definition_from_package(paquete, input);
    const bot = await upsert_bot(this.pool, {
      organization_id: account.organization_id,
      account_id: account.id,
      tenant_id: account.tenant_id,
      name: input.name ?? paquete.nombre,
      slug: input.slug ?? slug_from_name(input.name ?? paquete.paquete_id),
      channel: "whatsapp",
      bot_type: "custom",
      status: input.status ?? "draft",
      description: paquete.descripcion,
      definition_json,
      definition_version: 1,
      paquete_id: paquete.paquete_id,
      enabled_actions_json: input.enabled_actions_json ?? paquete.acciones_requeridas,
      reglas_escalamiento_json: input.reglas_escalamiento_json ?? paquete.reglas_de_escalamiento,
      campos_requeridos_json: input.campos_requeridos_json ?? paquete.campos_recomendados,
      settings_json: {
        paquete_id: paquete.paquete_id,
        paquete_version: paquete.version,
        acciones_opcionales: paquete.acciones_opcionales,
        knowledge_base_sugerida: paquete.knowledge_base_sugerida,
      },
    });

    return { bot, paquete, definition_json };
  }
}
