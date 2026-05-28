export async function list_discovery_questions(pool, input = {}) {
  const values = [];
  const filters = [];

  if (input.active_only !== false) {
    filters.push("activa = true");
  }

  if (input.version) {
    values.push(input.version);
    filters.push(`version = $${values.length}`);
  }

  const result = await pool.query(
    `
      SELECT *
      FROM discovery_questions
      ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
      ORDER BY bloque, orden
    `,
    values,
  );

  return result.rows;
}

export async function get_discovery_interview_from_db(pool, input = {}) {
  const questions = await list_discovery_questions(pool, input);
  const bloques = [];

  for (const question of questions) {
    let bloque = bloques.find((candidate) => candidate.bloque === question.bloque);

    if (!bloque) {
      bloque = {
        bloque: question.bloque,
        preguntas: [],
      };
      bloques.push(bloque);
    }

    bloque.preguntas.push({
      pregunta_id: question.pregunta_id,
      texto: question.texto,
      tipo_respuesta: question.tipo_respuesta,
      ayuda: question.ayuda,
      activa: question.activa,
      orden: question.orden,
    });
  }

  return {
    interview_id: "diagnostico_ai_negocio",
    version: input.version ?? 1,
    bloques,
  };
}
