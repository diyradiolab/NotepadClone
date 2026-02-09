/**
 * Diagram viewer using Mermaid.js for flowcharts, ER diagrams, etc.
 * Split-pane layout: Monaco editor (left) + live diagram preview (right).
 */
import mermaid from 'mermaid';
import { createEditor } from '../editor/monaco-setup';

// ── Templates ──

const FLOWCHART_TEMPLATE = `graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E`;

const SEQUENCE_TEMPLATE = `sequenceDiagram
    participant A as Alice
    participant B as Bob
    A->>B: Hello Bob
    B-->>A: Hi Alice
    A->>B: How are you?
    B-->>A: I'm good, thanks!`;

const CLASS_TEMPLATE = `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +String breed
        +fetch()
    }
    class Cat {
        +String color
        +purr()
    }
    Animal <|-- Dog
    Animal <|-- Cat`;

const ER_TEMPLATE = `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER {
        string name
        string email
    }
    ORDER {
        int orderNumber
        date created
    }
    LINE-ITEM {
        string product
        int quantity
        float price
    }`;

const STATE_TEMPLATE = `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing : submit
    Processing --> Success : done
    Processing --> Error : fail
    Error --> Idle : retry
    Success --> [*]`;

const GANTT_TEMPLATE = `gantt
    title Project Schedule
    dateFormat  YYYY-MM-DD
    section Design
    Wireframes     :a1, 2024-01-01, 7d
    Mockups        :after a1, 5d
    section Development
    Frontend       :2024-01-15, 14d
    Backend        :2024-01-15, 14d
    section Testing
    QA             :2024-02-01, 7d`;

// ── File detection ──

export function isDiagramFile(filename) {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  return lower.endsWith('.mmd') || lower.endsWith('.mermaid');
}

// ── DiagramViewer ──

export class DiagramViewer {
  constructor(container) {
    this.container = container;
    this._wrapper = null;
    this._templateBar = null;
    this._leftPane = null;
    this._rightPane = null;
    this._resizeHandle = null;
    this._editor = null;
    this._model = null;
    this._contentDisposable = null;
    this._renderTimer = null;
    this._renderCounter = 0;
    this._splitRatio = 0.5;
    this._lastValidSvg = null;
    this._onChangeCb = null;
    this._isSplitView = true;
  }

  /**
   * Render diagram split view.
   * @param {monaco.editor.ITextModel} model - Monaco model from EditorManager
   * @param {string} theme - 'light' or 'dark'
   */
  render(model, theme) {
    this.destroy();
    this._model = model;
    this.container.innerHTML = '';

    // Initialize mermaid with current theme
    const mermaidTheme = (theme === 'dark') ? 'dark' : 'default';
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: mermaidTheme,
    });

    // Root wrapper
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'dv-wrapper';

    // Template toolbar
    this._templateBar = this._createTemplateBar();
    this._wrapper.appendChild(this._templateBar);

    // Split container
    const splitContainer = document.createElement('div');
    splitContainer.className = 'dv-split-container';

    // Left pane (editor)
    this._leftPane = document.createElement('div');
    this._leftPane.className = 'dv-left-pane';
    this._leftPane.style.width = `${this._splitRatio * 100}%`;

    // Resize handle
    this._resizeHandle = document.createElement('div');
    this._resizeHandle.className = 'dv-resize-handle';
    this._setupResizeHandle(splitContainer);

    // Right pane (preview)
    this._rightPane = document.createElement('div');
    this._rightPane.className = 'dv-right-pane';
    this._rightPane.style.width = `${(1 - this._splitRatio) * 100}%`;

    splitContainer.appendChild(this._leftPane);
    splitContainer.appendChild(this._resizeHandle);
    splitContainer.appendChild(this._rightPane);
    this._wrapper.appendChild(splitContainer);

    this.container.appendChild(this._wrapper);

    // Create Monaco editor in left pane
    this._editor = createEditor(this._leftPane, { model: this._model });

    // Listen for content changes (debounced)
    this._contentDisposable = this._model.onDidChangeContent(() => {
      this._scheduleRender();
      if (this._onChangeCb) this._onChangeCb();
    });

    // Initial render
    this._renderDiagram();
  }

  async _renderDiagram() {
    const code = this._model ? this._model.getValue().trim() : '';
    if (!code) {
      this._rightPane.innerHTML = '<div class="dv-placeholder">Enter Mermaid diagram code on the left</div>';
      return;
    }

    try {
      const id = `mermaid-diagram-${++this._renderCounter}`;
      const { svg } = await mermaid.render(id, code);
      this._rightPane.innerHTML = '';
      const svgContainer = document.createElement('div');
      svgContainer.className = 'dv-svg-container';
      svgContainer.innerHTML = svg;
      this._rightPane.appendChild(svgContainer);
      this._lastValidSvg = svg;
    } catch (err) {
      this._rightPane.innerHTML = '';
      const errorDiv = document.createElement('div');
      errorDiv.className = 'dv-error';
      errorDiv.textContent = err.message || 'Invalid Mermaid syntax';
      this._rightPane.appendChild(errorDiv);
    }
  }

  _scheduleRender() {
    if (this._renderTimer) clearTimeout(this._renderTimer);
    this._renderTimer = setTimeout(() => this._renderDiagram(), 500);
  }

  _createTemplateBar() {
    const bar = document.createElement('div');
    bar.className = 'dv-template-bar';

    const templates = [
      { label: 'Flowchart', code: FLOWCHART_TEMPLATE },
      { label: 'Sequence', code: SEQUENCE_TEMPLATE },
      { label: 'Class', code: CLASS_TEMPLATE },
      { label: 'ER Diagram', code: ER_TEMPLATE },
      { label: 'State', code: STATE_TEMPLATE },
      { label: 'Gantt', code: GANTT_TEMPLATE },
    ];

    const label = document.createElement('span');
    label.className = 'dv-template-label';
    label.textContent = 'Templates:';
    bar.appendChild(label);

    for (const tmpl of templates) {
      const btn = document.createElement('button');
      btn.className = 'dv-template-btn';
      btn.textContent = tmpl.label;
      btn.title = `Insert ${tmpl.label} template`;
      btn.addEventListener('click', () => {
        this._model.setValue(tmpl.code);
      });
      bar.appendChild(btn);
    }

    return bar;
  }

  _setupResizeHandle(splitContainer) {
    let startX, startLeftWidth, containerWidth;

    const onMouseDown = (e) => {
      e.preventDefault();
      startX = e.clientX;
      const rect = splitContainer.getBoundingClientRect();
      containerWidth = rect.width;
      startLeftWidth = this._leftPane.getBoundingClientRect().width;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      this._resizeHandle.classList.add('dv-resize-active');
    };

    const onMouseMove = (e) => {
      const dx = e.clientX - startX;
      let newLeftWidth = startLeftWidth + dx;
      const minWidth = 200;
      newLeftWidth = Math.max(minWidth, Math.min(containerWidth - minWidth, newLeftWidth));
      this._splitRatio = newLeftWidth / containerWidth;
      this._leftPane.style.width = `${this._splitRatio * 100}%`;
      this._rightPane.style.width = `${(1 - this._splitRatio) * 100}%`;
      if (this._editor) this._editor.layout();
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      this._resizeHandle.classList.remove('dv-resize-active');
    };

    this._resizeHandle.addEventListener('mousedown', onMouseDown);
  }

  getSvg() {
    return this._lastValidSvg || null;
  }

  toggleSplitView() {
    this._isSplitView = !this._isSplitView;
    if (this._isSplitView) {
      this._rightPane.style.display = '';
      this._resizeHandle.style.display = '';
      this._leftPane.style.width = `${this._splitRatio * 100}%`;
      this._renderDiagram();
    } else {
      this._rightPane.style.display = 'none';
      this._resizeHandle.style.display = 'none';
      this._leftPane.style.width = '100%';
    }
    if (this._editor) this._editor.layout();
    return this._isSplitView;
  }

  onChange(callback) {
    this._onChangeCb = callback;
  }

  destroy() {
    if (this._renderTimer) clearTimeout(this._renderTimer);
    if (this._contentDisposable) {
      this._contentDisposable.dispose();
      this._contentDisposable = null;
    }
    if (this._editor) {
      this._editor.dispose();
      this._editor = null;
    }
    this._model = null;
    this._wrapper = null;
    this._templateBar = null;
    this._leftPane = null;
    this._rightPane = null;
    this._resizeHandle = null;
    this._lastValidSvg = null;
    this._onChangeCb = null;
    this.container.innerHTML = '';
  }
}
