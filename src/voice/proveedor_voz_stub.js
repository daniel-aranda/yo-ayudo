export class proveedor_voz_stub {
  async iniciar_llamada(input) {
    return this.pending_provider("iniciar_llamada", input);
  }

  async programar_llamada(input) {
    return this.pending_provider("programar_llamada", input);
  }

  async conectar_llamada(input) {
    return this.pending_provider("conectar_llamada", input);
  }

  async obtener_estado_llamada(input) {
    return this.pending_provider("obtener_estado_llamada", input);
  }

  async registrar_webhook_llamada(input) {
    return this.pending_provider("registrar_webhook_llamada", input);
  }

  pending_provider(operation, input) {
    return {
      status: "pending_provider",
      provider: "voice_provider_stub",
      operation,
      input,
    };
  }
}
