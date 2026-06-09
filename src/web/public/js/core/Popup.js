(() => {
  // Agnostic, markup-driven popup. Ported from Wamy/UI core so the inspector
  // reuses the same overlay contract instead of reinventing it:
  //   [data-popup-overlay]                overlay root (toggles .is-open)
  //   [data-popup-close]                  any element that closes on click
  //   data-popup-overlay-close="true"     clicking the backdrop closes it
  // Loaded via pug `include`, so it attaches to window instead of using `export`.
  class Popup {
    constructor({
      overlay_selector = "[data-popup-overlay]",
      close_selector = "[data-popup-close]",
    } = {}) {
      this.overlay_selector = overlay_selector;
      this.close_selector = close_selector;
      this.overlay_el = null;
      this._on_click = this._on_click.bind(this);
      this._on_keydown = this._on_keydown.bind(this);
    }

    iniciar() {
      this.overlay_el = document.querySelector(this.overlay_selector);
      if (!this.overlay_el) return;
      this.overlay_el.addEventListener("click", this._on_click);
      document.addEventListener("keydown", this._on_keydown);
    }

    destroy() {
      if (!this.overlay_el) return;
      this.overlay_el.removeEventListener("click", this._on_click);
      document.removeEventListener("keydown", this._on_keydown);
    }

    is_open() {
      return Boolean(this.overlay_el && this.overlay_el.classList.contains("is-open"));
    }

    open() {
      if (!this.overlay_el) return;
      this.overlay_el.classList.add("is-open");
      document.body.classList.add("body--popup-open");
    }

    close() {
      if (!this.overlay_el) return;
      this.overlay_el.classList.remove("is-open");
      document.body.classList.remove("body--popup-open");
    }

    _on_click(event) {
      if (!this.overlay_el) return;
      const close_trigger = event.target.closest(this.close_selector);
      if (close_trigger) {
        this.close();
        return;
      }

      const allow_overlay_close = this.overlay_el.dataset.popupOverlayClose === "true";
      if (allow_overlay_close && event.target === this.overlay_el) {
        this.close();
      }
    }

    _on_keydown(event) {
      if (event.key !== "Escape") return;
      if (!this.overlay_el) return;
      if (!this.overlay_el.classList.contains("is-open")) return;
      this.close();
    }
  }

  window.Popup = Popup;
})();
