(() => {
  class TabNavigator {
    static instances_by_id = new Map();

    static render(selector = ".wamy-tabs > .tabs") {
      const containers = Array.from(document.querySelectorAll(selector));

      containers.forEach((container) => {
        const id = String(container.id || "").trim();
        if (!id) throw new Error("TabNavigator: each .tabs must have an id");

        const previous = TabNavigator.instances_by_id.get(id);
        previous?.destroy();

        const instance = new TabNavigator(container);
        TabNavigator.instances_by_id.set(id, instance);
      });

      return Array.from(TabNavigator.instances_by_id.values());
    }

    static get(id) {
      return TabNavigator.instances_by_id.get(id) || null;
    }

    constructor(container) {
      this.container = container;
      this.id = String(container.id || "").trim();
      this.tabs = Array.from(container.querySelectorAll(".tab"));
      this.sections_by_key = this.resolve_sections();
      this.active_tab = null;
      this.on_click = this.on_click.bind(this);

      this.bind_events();
      this.activate_initial();
    }

    destroy() {
      this.container.removeEventListener("click", this.on_click);
    }

    bind_events() {
      this.container.addEventListener("click", this.on_click);
    }

    on_click(event) {
      const tab = event.target.closest(".tab");
      if (!tab || !this.tabs.includes(tab)) return;
      this.activate(tab);
    }

    activate_initial() {
      const initial_key = this.get_initial_key();
      const tab_by_active = this.tabs.find((tab) => tab.classList.contains("active")) || null;
      const tab_by_initial = initial_key ? this.tabs.find((tab) => this.get_tab_key(tab) === initial_key) || null : null;
      const initial_tab = tab_by_active || tab_by_initial || this.tabs[0] || null;

      if (initial_tab) this.activate(initial_tab, { emit_event: false });
    }

    get_initial_key() {
      return String(this.container.dataset.initialTab || this.container.dataset.initialSection || "").trim() || null;
    }

    get_tab_key(tab) {
      return String(tab.dataset.seccion || tab.dataset.section || "").trim() || null;
    }

    resolve_sections() {
      const escaped_id = this.escape_selector(this.id);
      const selector_es = `.tab-seccion[data-parent-tab="${escaped_id}"][data-seccion], .tab-seccion[data-parent-tab="${escaped_id}"][data-section]`;
      const selector_en = `.tab-section[data-parent-tab="${escaped_id}"][data-seccion], .tab-section[data-parent-tab="${escaped_id}"][data-section]`;
      const nodes = Array.from(document.querySelectorAll(`${selector_es}, ${selector_en}`));
      const map = new Map();

      nodes.forEach((node) => {
        const key = String(node.dataset.seccion || node.dataset.section || "").trim();
        if (!key) return;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(node);
      });

      return map;
    }

    activate(tab, { emit_event = true } = {}) {
      if (this.active_tab === tab) return;

      this.tabs.forEach((item) => {
        item.classList.remove("active");
        item.setAttribute("aria-selected", "false");
        item.setAttribute("tabindex", "-1");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      tab.setAttribute("tabindex", "0");
      this.active_tab = tab;

      const detail = this.build_detail(tab);
      this.apply_active_section(detail.section);

      if (emit_event) this.emit_change(detail);
    }

    activate_by_section(section_key) {
      const target = this.tabs.find((tab) => this.get_tab_key(tab) === section_key);
      if (target) this.activate(target);
    }

    get_active_detail() {
      return this.active_tab ? this.build_detail(this.active_tab) : null;
    }

    build_detail(tab) {
      return {
        parent_tab: this.id,
        section: this.get_tab_key(tab),
        index: this.tabs.indexOf(tab),
        text: tab.textContent.trim(),
        tab,
      };
    }

    apply_active_section(active_section) {
      for (const [section_key, nodes] of this.sections_by_key.entries()) {
        const is_visible = active_section && section_key === active_section;
        nodes.forEach((node) => {
          node.hidden = !is_visible;
        });
      }
    }

    emit_change(detail) {
      this.container.dispatchEvent(new CustomEvent("tab:change", { detail }));
      this.container.dispatchEvent(new CustomEvent("tab:cambio", { detail }));
    }

    escape_selector(value) {
      if (window.CSS?.escape) return window.CSS.escape(value);
      return String(value).replace(/["\\]/g, "\\$&");
    }
  }

  window.TabNavigator = TabNavigator;
  window.Tab_Navigator = TabNavigator;
})();
