import '../../src/renderer/styles/options-dialog.css';

export function activate(api) {
  const settingsService = api._services.settingsService;
  let overlay = null;
  let activeCategory = null; // persists across open/close within session

  function show() {
    if (overlay) return;

    const schema = settingsService.getSchema();
    const pluginSettings = settingsService.getPluginSettings();

    // Build category list: built-in first, then plugin-contributed
    const categories = [];
    for (const [key, def] of Object.entries(schema)) {
      categories.push({ key, label: def.label, settings: def.settings, isPlugin: false });
    }
    for (const [, pluginDef] of Object.entries(pluginSettings)) {
      categories.push({ key: pluginDef.category, label: pluginDef.label, settings: pluginDef.settings, isPlugin: true });
    }

    if (!activeCategory || !categories.find(c => c.key === activeCategory)) {
      activeCategory = categories[0]?.key || null;
    }

    overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog-box opt-dialog">
        <div class="dialog-header">
          <span class="dialog-title">Options</span>
          <button class="opt-close-x" title="Close">\u00d7</button>
        </div>
        <div class="opt-body">
          <div class="opt-sidebar"></div>
          <div class="opt-panel"></div>
        </div>
        <div class="dialog-footer opt-footer">
          <button class="dialog-btn" id="opt-restore-defaults">Restore Defaults</button>
          <button class="dialog-btn dialog-btn-primary" id="opt-close">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const sidebar = overlay.querySelector('.opt-sidebar');
    const panel = overlay.querySelector('.opt-panel');

    function renderSidebar() {
      sidebar.innerHTML = '';
      for (const cat of categories) {
        const item = document.createElement('div');
        item.className = 'opt-cat-item' + (cat.key === activeCategory ? ' active' : '');
        item.textContent = cat.label;
        item.addEventListener('click', () => {
          activeCategory = cat.key;
          renderSidebar();
          renderPanel();
        });
        sidebar.appendChild(item);
      }
    }

    function renderPanel() {
      const cat = categories.find(c => c.key === activeCategory);
      if (!cat) { panel.innerHTML = ''; return; }

      panel.innerHTML = `<div class="opt-panel-title">${cat.label}</div>`;

      for (const [key, setting] of Object.entries(cat.settings)) {
        const flatKey = `${cat.key}.${key}`;
        const value = settingsService.get(flatKey);
        const row = document.createElement('div');
        row.className = 'opt-row';

        const label = document.createElement('span');
        label.className = 'opt-label';
        label.textContent = setting.label;
        row.appendChild(label);

        const control = createControl(flatKey, setting, value);
        row.appendChild(control);
        panel.appendChild(row);
      }
    }

    function createControl(flatKey, setting, value) {
      if (setting.type === 'boolean') {
        const toggle = document.createElement('label');
        toggle.className = 'opt-toggle';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!value;
        input.addEventListener('change', () => {
          settingsService.set(flatKey, input.checked);
        });
        const slider = document.createElement('span');
        slider.className = 'opt-toggle-slider';
        toggle.appendChild(input);
        toggle.appendChild(slider);
        return toggle;
      }

      if (setting.type === 'select') {
        const select = document.createElement('select');
        select.className = 'opt-select';
        for (const opt of setting.options) {
          const option = document.createElement('option');
          option.value = opt;
          option.textContent = opt;
          if (opt === value) option.selected = true;
          select.appendChild(option);
        }
        select.addEventListener('change', () => {
          settingsService.set(flatKey, select.value);
        });
        return select;
      }

      if (setting.type === 'number') {
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'opt-number';
        input.value = value;
        if (setting.min !== undefined) input.min = setting.min;
        if (setting.max !== undefined) input.max = setting.max;
        input.addEventListener('change', () => {
          let num = parseInt(input.value, 10);
          if (isNaN(num)) num = setting.default;
          if (setting.min !== undefined && num < setting.min) num = setting.min;
          if (setting.max !== undefined && num > setting.max) num = setting.max;
          input.value = num;
          settingsService.set(flatKey, num);
        });
        return input;
      }

      // string
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'opt-text';
      input.value = value || '';
      input.addEventListener('change', () => {
        settingsService.set(flatKey, input.value);
      });
      return input;
    }

    renderSidebar();
    renderPanel();

    // Restore defaults for active category
    overlay.querySelector('#opt-restore-defaults').addEventListener('click', async () => {
      if (activeCategory) {
        await settingsService.resetSection(activeCategory);
        renderPanel();
      }
    });

    // Close handlers
    function close() {
      if (overlay) {
        overlay.remove();
        overlay = null;
      }
    }

    overlay.querySelector('.opt-close-x').addEventListener('click', close);
    overlay.querySelector('#opt-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', onKeyDown);
      }
    };
    document.addEventListener('keydown', onKeyDown);
  }

  api.registerCommand({
    id: 'options.show',
    title: 'Options',
    shortcut: 'Ctrl+,',
    handler: () => show(),
  });

  return {
    deactivate() {},
  };
}
