# Product

## Register

product

## Users

Dos audiencias, una prioritaria.

**1. Dueño de negocio (PRIORIDAD).** Pequeño empresario no técnico (taquería, comercio, servicios). Su contexto: ocupado, en el celular, atendiendo su negocio — no frente a una laptop analizando tableros. Quiere responder de un vistazo "¿qué está pasando en mi negocio ahora?": ventas del día, caja, tareas abiertas, qué hizo el bot por WhatsApp. Habla español, no JSON. La UI que se le vende es su dashboard scopeado a la cuenta + tareas + actividad en lenguaje natural.

**2. Operador / founder de plataforma.** Vende y opera bots configurables sin ingeniería por cliente. Su contexto: admin global, inspector de bots, cola de review, guardrails, traza técnica del pipeline. Tolera más densidad porque es su cabina de trabajo — pero existe para servir al producto del dueño, no al revés.

El aislamiento es por cuenta y por bot/contacto: organization (negocio) → account (cuenta) → bot. Sin `tenant` ni `branch`.

## Product Purpose

YoAyudo es un **Bot Engine configurable** para negocios: el código es el motor, los bots son configuración. Convierte `prompts + business knowledge + conversation memory + actions + guardrails` en bots operativos que atienden por WhatsApp, venden, dan seguimiento, organizan trabajo y ejecutan acciones reales.

Tesis del producto: **PostgreSQL guarda la verdad; la AI interpreta lenguaje; el backend valida y audita.** Si una capacidad modifica el mundo es una Action (en código, con permisos/riesgo/auditoría). Si una acción no existe o no está habilitada, se registra un guardrail event — el motor nunca finge una ejecución. Los guardrails son a la vez radar de seguridad y roadmap de demanda real.

Éxito = un dueño puede comprar, configurar y confiar en un bot que opera su negocio por WhatsApp, sin tocar código y sin tener que entender el motor por dentro.

## Brand Personality

**Cálido · claro · cercano.** La voz es la de un colega que te resuelve, no la de un panel de ingeniería. Español llano (es-MX), nada de jerga técnica frente al dueño.

Meta emocional: el dueño siente *"esto es para mí, lo entiendo de un vistazo, no voy a romper nada, y me habla en mi idioma."* Confianza sin intimidación. La calidez se carga en el lenguaje, el espaciado generoso y los estados honestos — no en decoración.

## Anti-references

- **Tablero de avión / cabina de control (lo más importante).** El dueño NO debe sentir que pilotea un 747: nada de paredes de instrumentos, controles densos ni jerga de "control room". (Esto matiza el framing legacy de "cabina de control" en `knowledge/architecture/frontend.md`: aplica como mucho al lado operador/inspector — la superficie del dueño se mantiene simple.)
- **Dashboards decorativos / de vanidad.** Sin chart-junk, sin métricas placeholder, sin tres tiles en $0. Se muestra actividad real o un estado vacío honesto.
- **Tecnología cruda en la vista del dueño.** Nada de raw payloads, processing events ni JSON en el dashboard del negocio: eso vive SOLO en el inspector.
- **Densidad enterprise abrumadora.** No amontonar todos los controles en una pantalla; revelación progresiva sobre muro-de-opciones.

## Design Principles

1. **El dueño primero.** Cada pantalla del negocio responde "¿qué pasa en mi negocio ahora?" de un vistazo y en español llano. Si un dueño no técnico no la entiende sin ayuda, está mal.
2. **Simple, no cabina.** Una tarea principal por pantalla, revelación progresiva, densidad calmada. Las herramientas de poder (admin/inspector) pueden ser más densas; la superficie que se vende, no.
3. **Lenguaje de negocio, no de máquina.** Traducir las internas del motor (actions, guardrails, eventos, payloads) a etiquetas humanas ("Venta registrada", "Tarea abierta"). La maquinaria queda en el inspector.
4. **Estados honestos, nunca fingidos.** La ética del motor ("no fingir ejecuciones de AI") es también regla de UI: actividad real o estado vacío honesto; jamás métricas de relleno ni una acción que aparenta haber corrido.
5. **Confianza por la traza.** Que sea fácil ver qué hizo el bot y por qué. La tranquilidad del dueño nace de que todo queda registrado y nada pasa sin rastro.

## Accessibility & Inclusion

No es prioridad por decisión explícita del founder; no se impone un nivel WCAG como gate. Nota pragmática (no obligatoria): la legibilidad sigue sirviendo a la meta "cálido y claro" — texto que se lee sin esfuerzo, copy en español y que cargue/funcione en celulares comunes. Si más adelante se quiere subir el listón, el punto de partida natural es WCAG 2.1 AA.
