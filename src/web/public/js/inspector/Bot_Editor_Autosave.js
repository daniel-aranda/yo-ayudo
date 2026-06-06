(() => {
  class Eventable extends EventTarget {
    on(type, listener, options) {
      this.addEventListener(type, listener, options);
    }

    emit(event_name, detail = {}) {
      this.dispatchEvent(new CustomEvent(event_name, { detail }));
    }
  }

  class Editor_Autosave_Base extends Eventable {
    static factory({
      root_selector,
      throttle_ms = 500,
      autosave_event_name = "editor:autosave",
      include_disabled = false,
      blur_cooldown_ms = 150,
    } = {}) {
      return new Editor_Autosave_Base({
        root_selector,
        throttle_ms,
        autosave_event_name,
        include_disabled,
        blur_cooldown_ms,
      });
    }

    constructor({ root_selector, throttle_ms, autosave_event_name, include_disabled, blur_cooldown_ms }) {
      super();

      this.root = typeof root_selector === "string" ? document.querySelector(root_selector) : root_selector;
      this.throttle_ms = throttle_ms;
      this.autosave_event_name = autosave_event_name;
      this.include_disabled = include_disabled;
      this.blur_cooldown_ms = blur_cooldown_ms;

      this._timer_id = null;
      this._pending_payload = null;
      this._is_dirty = false;
      this._last_emit_ms = 0;
      this._last_input_value_by_name = Object.create(null);

      this._on_input = this._on_input.bind(this);
      this._on_change = this._on_change.bind(this);
      this._on_blur = this._on_blur.bind(this);
    }

    init() {
      if (!this.root) return;

      this.root.addEventListener("input", this._on_input, true);
      this.root.addEventListener("change", this._on_change, true);
      this.root.addEventListener("blur", this._on_blur, true);
    }

    destroy() {
      if (!this.root) return;

      this.root.removeEventListener("input", this._on_input, true);
      this.root.removeEventListener("change", this._on_change, true);
      this.root.removeEventListener("blur", this._on_blur, true);

      this._clear_timer();
      this._pending_payload = null;
      this._is_dirty = false;
      this._last_input_value_by_name = Object.create(null);
    }

    flush() {
      this._clear_timer();

      if (!this._is_dirty || !this._pending_payload) return;

      const payload = this._pending_payload;
      this._is_dirty = false;
      this._pending_payload = null;
      this._last_emit_ms = Date.now();

      this.dispatchEvent(new CustomEvent(this.autosave_event_name, { detail: payload }));
    }

    _on_input(event) {
      if (!this._is_control_target(event.target)) return;

      const target = event.target;
      if (target.tagName === "SELECT") return;

      if (target.tagName === "INPUT") {
        const type = String(target.type ?? "").toLowerCase();
        if (type === "checkbox" || type === "radio" || type === "file") return;
      }

      const key = this._control_key(target);
      if (key) this._last_input_value_by_name[key] = this._read_control_value(target);

      this._debounce(event);
    }

    _on_change(event) {
      if (!this._is_control_target(event.target)) return;

      const target = event.target;
      if (target.tagName === "SELECT") {
        this._debounce(event);
        return;
      }

      if (target.tagName === "TEXTAREA") return;

      if (target.tagName === "INPUT") {
        const type = String(target.type ?? "").toLowerCase();
        if (type === "checkbox" || type === "radio" || type === "file") {
          this._debounce(event);
          return;
        }

        const key = this._control_key(target);
        if (!key) return;

        const current_value = this._read_control_value(target);
        if (this._last_input_value_by_name[key] === current_value) return;

        this._last_input_value_by_name[key] = current_value;
        this._debounce(event);
      }
    }

    _on_blur(event) {
      if (!this._is_control_target(event.target) || !this._is_dirty) return;

      const now_ms = Date.now();
      if (now_ms - this._last_emit_ms < this.blur_cooldown_ms) return;

      this._pending_payload = this._build_payload({ control: event.target, event });
      this.flush();
    }

    _debounce(event) {
      this._is_dirty = true;
      this._pending_payload = this._build_payload({ control: event.target, event });

      this._clear_timer();
      this._timer_id = setTimeout(() => {
        this._timer_id = null;
        this.flush();
      }, this.throttle_ms);
    }

    _clear_timer() {
      if (!this._timer_id) return;
      clearTimeout(this._timer_id);
      this._timer_id = null;
    }

    _is_control_target(target) {
      if (!target || target.nodeType !== 1) return false;

      const tag_name = target.tagName;
      if (tag_name !== "INPUT" && tag_name !== "TEXTAREA" && tag_name !== "SELECT") return false;
      if (!this.include_disabled && target.disabled) return false;

      const type = String(target.getAttribute("type") ?? "").toLowerCase();
      if (tag_name === "INPUT" && (type === "button" || type === "submit" || type === "reset")) return false;

      return this.root.contains(target);
    }

    _control_key(control) {
      if (control.name) return `name:${control.name}`;
      if (control.id) return `id:${control.id}`;
      return null;
    }

    _build_payload({ control, event }) {
      return {
        control: {
          id: control.id || null,
          name: control.name || null,
          tag: control.tagName.toLowerCase(),
          type: control.tagName === "INPUT" ? control.type || null : null,
          value: this._read_control_value(control),
        },
        event: { type: event.type },
        at_ms: Date.now(),
      };
    }

    _read_control_value(control) {
      if (control.tagName === "INPUT") {
        const type = String(control.type ?? "").toLowerCase();
        if (type === "checkbox") return Boolean(control.checked);
        if (type === "radio") return control.checked ? control.value : null;
        if (type === "file") return null;
        return control.value ?? null;
      }

      if (control.tagName === "SELECT") {
        if (control.multiple) return Array.from(control.selectedOptions).map((option) => option.value);
        return control.value ?? null;
      }

      return control.value ?? null;
    }
  }

  class Autosave_Indicator extends Eventable {
    static factory({
      root_selector = "#autosave-indicator",
      autosave_event_name = "editor:autosave",
      saving_text = "Guardando cambios...",
      saved_text = "Cambios guardados",
      error_text = "No se pudo guardar",
      hide_after_ms = 1400,
    } = {}) {
      return new Autosave_Indicator({
        root_selector,
        autosave_event_name,
        saving_text,
        saved_text,
        error_text,
        hide_after_ms,
      });
    }

    constructor({ root_selector, autosave_event_name, saving_text, saved_text, error_text, hide_after_ms }) {
      super();

      this.root = typeof root_selector === "string" ? document.querySelector(root_selector) : root_selector;
      this.autosave_event_name = autosave_event_name;
      this.saving_text = saving_text;
      this.saved_text = saved_text;
      this.error_text = error_text;
      this.hide_after_ms = hide_after_ms;

      this._text_el = this.root?.querySelector(".autosave-text") ?? null;
      this._hide_timer_id = null;

      this._on_autosave = this._on_autosave.bind(this);
      this._on_saved = this._on_saved.bind(this);
      this._on_error = this._on_error.bind(this);
    }

    init() {
      if (!this.root) return;

      this._ensure_markup();
      window.addEventListener(this.autosave_event_name, this._on_autosave);
      window.addEventListener("editor:autosave:saved", this._on_saved);
      window.addEventListener("editor:autosave:error", this._on_error);
    }

    destroy() {
      window.removeEventListener(this.autosave_event_name, this._on_autosave);
      window.removeEventListener("editor:autosave:saved", this._on_saved);
      window.removeEventListener("editor:autosave:error", this._on_error);
      this._clear_hide_timer();
    }

    show_saving() {
      this._clear_hide_timer();
      this._set_state("saving", this.saving_text);
      this._show();
    }

    show_saved() {
      this._clear_hide_timer();
      this._set_state("saved", this.saved_text);
      this._show();

      this._hide_timer_id = setTimeout(() => {
        this.hide();
      }, this.hide_after_ms);
    }

    show_error(message) {
      this._clear_hide_timer();
      this._set_state("error", message || this.error_text);
      this._show();
    }

    hide() {
      this.root.classList.add("hidden");
      this.root.classList.remove("visible", "saving", "saved", "error");
    }

    _on_autosave(event) {
      this.show_saving();
      this.dispatchEvent(new CustomEvent("autosave:started", { detail: event.detail }));
    }

    _on_saved(event) {
      this.show_saved();
      this.dispatchEvent(new CustomEvent("autosave:saved", { detail: event.detail }));
    }

    _on_error(event) {
      this.show_error(event.detail?.message);
      this.dispatchEvent(new CustomEvent("autosave:error", { detail: event.detail }));
    }

    _set_state(state, text) {
      this.root.classList.remove("saving", "saved", "error");
      this.root.classList.add(state);

      if (this._text_el) {
        this._text_el.textContent = text;
      }
    }

    _show() {
      this.root.classList.remove("hidden");
      this.root.classList.add("visible");
    }

    _clear_hide_timer() {
      if (!this._hide_timer_id) return;
      clearTimeout(this._hide_timer_id);
      this._hide_timer_id = null;
    }

    _ensure_markup() {
      if (!this._text_el) {
        const span = document.createElement("span");
        span.className = "autosave-text";
        this.root.appendChild(span);
        this._text_el = span;
      }

      this.root.classList.add("autosave-indicator");

      if (!this.root.classList.contains("hidden") && !this.root.classList.contains("visible")) {
        this.root.classList.add("hidden");
      }
    }
  }

  class Bot_Editor_Autosave {
    constructor({ form_selector = "#bot-editor", indicator_selector = "#autosave-indicator" } = {}) {
      this.form = document.querySelector(form_selector);
      this.indicator = Autosave_Indicator.factory({
        root_selector: indicator_selector,
        autosave_event_name: "bot-editor:autosave",
      });
      this.autosave = Editor_Autosave_Base.factory({
        root_selector: this.form,
        throttle_ms: 650,
        autosave_event_name: "bot-editor:autosave",
      });

      this._queued_payload = null;
      this._is_saving = false;
      this._on_autosave = this._on_autosave.bind(this);
    }

    init() {
      if (!this.form) return;

      this.indicator.init();
      this.autosave.init();
      this.autosave.addEventListener(this.autosave.autosave_event_name, this._on_autosave);
    }

    destroy() {
      this.autosave.removeEventListener(this.autosave.autosave_event_name, this._on_autosave);
      this.autosave.destroy();
      this.indicator.destroy();
    }

    request_save(detail = {}) {
      window.dispatchEvent(new CustomEvent(this.autosave.autosave_event_name, { detail }));
      return this._save(detail);
    }

    _on_autosave(event) {
      window.dispatchEvent(new CustomEvent(this.autosave.autosave_event_name, { detail: event.detail }));
      this._save(event.detail);
    }

    async _save(detail = {}) {
      if (this._is_saving) {
        this._queued_payload = detail;
        return;
      }

      this._is_saving = true;

      try {
        const response = await fetch(this.form.action, {
          method: this.form.method || "POST",
          headers: {
            Accept: "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: new URLSearchParams(new FormData(this.form)),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.message || payload.error || "No se pudo guardar");
        }

        window.dispatchEvent(new CustomEvent("editor:autosave:saved", { detail: { ...detail, response: payload } }));
      } catch (error) {
        window.dispatchEvent(
          new CustomEvent("editor:autosave:error", {
            detail: { ...detail, message: error.message || "No se pudo guardar" },
          }),
        );
      } finally {
        this._is_saving = false;

        if (this._queued_payload) {
          const queued_payload = this._queued_payload;
          this._queued_payload = null;
          this.request_save(queued_payload);
        }
      }
    }
  }

  function init_bot_editor_autosave() {
    if (window.bot_editor_autosave) {
      window.bot_editor_autosave.destroy();
    }

    const bot_editor_autosave = new Bot_Editor_Autosave();
    bot_editor_autosave.init();
    window.bot_editor_autosave = bot_editor_autosave;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init_bot_editor_autosave, { once: true });
  } else {
    init_bot_editor_autosave();
  }
})();
