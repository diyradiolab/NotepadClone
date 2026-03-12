import * as fabric from 'fabric';

const TOOLS = [
  { id: 'select', icon: '⇱', title: 'Select (V)', key: 'v' },
  { id: 'pen', icon: '✎', title: 'Pen (P)', key: 'p' },
  { id: 'line', icon: '╱', title: 'Line (L)', key: 'l' },
  { id: 'rect', icon: '▭', title: 'Rectangle (R)', key: 'r' },
  { id: 'ellipse', icon: '◯', title: 'Ellipse (E)', key: 'e' },
  { id: 'text', icon: 'T', title: 'Text (T)', key: 't' },
];

const LIGHT_BG = '#ffffff';
const DARK_BG = '#1e1e1e';

export class WhiteboardPanel {
  constructor(parentElement, onDirty) {
    this._parent = parentElement;
    this._onDirty = onDirty;
    this._canvas = null;
    this._activeTool = 'select';
    this._strokeColor = '#000000';
    this._fillColor = 'transparent';
    this._strokeWidth = 2;
    this._isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    this._undoStack = [];
    this._redoStack = [];
    this._maxUndo = 30;
    this._isUndoRedo = false;
    this._syncTimer = null;
    this._syncCallback = null;
    this._onZoomChange = null;
    this._shapeStart = null;
    this._tempShape = null;
    this._resizeObserver = null;
    this._isPanning = false;
    this._spaceHeld = false;
    this._panStart = null;

    this._buildDOM();
    this._initCanvas();
    this._setupResize();
    this._setupKeyboard();
  }

  // ── DOM Construction ──

  _buildDOM() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'wb-wrapper';
    this._wrapper.tabIndex = 0; // focusable for keyboard events

    // Toolbar
    this._toolbar = document.createElement('div');
    this._toolbar.className = 'wb-toolbar';

    // Tool buttons
    const toolGroup = document.createElement('div');
    toolGroup.className = 'wb-tool-group';
    this._toolButtons = {};
    for (const tool of TOOLS) {
      const btn = document.createElement('button');
      btn.className = 'wb-tool-btn';
      btn.title = tool.title;
      btn.textContent = tool.icon;
      btn.dataset.tool = tool.id;
      btn.addEventListener('click', () => this._setTool(tool.id));
      toolGroup.appendChild(btn);
      this._toolButtons[tool.id] = btn;
    }
    this._toolbar.appendChild(toolGroup);

    // Separator
    this._toolbar.appendChild(this._makeSep());

    // Stroke color
    const strokeLabel = document.createElement('label');
    strokeLabel.className = 'wb-color-label';
    strokeLabel.title = 'Stroke Color';
    this._strokeInput = document.createElement('input');
    this._strokeInput.type = 'color';
    this._strokeInput.value = this._strokeColor;
    this._strokeInput.className = 'wb-color-input';
    this._strokeInput.addEventListener('input', (e) => {
      this._strokeColor = e.target.value;
      this._applyToSelection('stroke', this._strokeColor);
    });
    strokeLabel.appendChild(this._strokeInput);
    strokeLabel.appendChild(document.createTextNode(' Stroke'));
    this._toolbar.appendChild(strokeLabel);

    // Fill color
    const fillLabel = document.createElement('label');
    fillLabel.className = 'wb-color-label';
    fillLabel.title = 'Fill Color';
    this._fillInput = document.createElement('input');
    this._fillInput.type = 'color';
    this._fillInput.value = '#ffffff';
    this._fillInput.className = 'wb-color-input';
    this._fillInput.addEventListener('input', (e) => {
      this._fillColor = e.target.value;
      this._applyToSelection('fill', this._fillColor);
    });
    fillLabel.appendChild(this._fillInput);
    fillLabel.appendChild(document.createTextNode(' Fill'));
    this._toolbar.appendChild(fillLabel);

    // No-fill toggle
    this._noFillBtn = document.createElement('button');
    this._noFillBtn.className = 'wb-tool-btn wb-no-fill active';
    this._noFillBtn.title = 'No Fill';
    this._noFillBtn.textContent = '∅';
    this._noFillBtn.addEventListener('click', () => {
      this._fillColor = this._fillColor === 'transparent' ? this._fillInput.value : 'transparent';
      this._noFillBtn.classList.toggle('active', this._fillColor === 'transparent');
      this._applyToSelection('fill', this._fillColor);
    });
    this._toolbar.appendChild(this._noFillBtn);

    // Separator
    this._toolbar.appendChild(this._makeSep());

    // Stroke width
    const widthLabel = document.createElement('label');
    widthLabel.className = 'wb-color-label';
    widthLabel.title = 'Stroke Width';
    this._widthInput = document.createElement('input');
    this._widthInput.type = 'range';
    this._widthInput.min = '1';
    this._widthInput.max = '20';
    this._widthInput.value = String(this._strokeWidth);
    this._widthInput.className = 'wb-width-input';
    this._widthInput.addEventListener('input', (e) => {
      this._strokeWidth = parseInt(e.target.value, 10);
      this._applyToSelection('strokeWidth', this._strokeWidth);
      if (this._canvas && this._canvas.isDrawingMode) {
        this._canvas.freeDrawingBrush.width = this._strokeWidth;
      }
    });
    widthLabel.appendChild(this._widthInput);
    widthLabel.appendChild(document.createTextNode(' Width'));
    this._toolbar.appendChild(widthLabel);

    // Separator
    this._toolbar.appendChild(this._makeSep());

    // Zoom controls
    const zoomGroup = document.createElement('div');
    zoomGroup.className = 'wb-tool-group';

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.className = 'wb-tool-btn';
    zoomOutBtn.title = 'Zoom Out (Ctrl+-)';
    zoomOutBtn.textContent = '−';
    zoomOutBtn.addEventListener('click', () => this._zoomBy(-0.1));
    zoomGroup.appendChild(zoomOutBtn);

    this._zoomLabel = document.createElement('span');
    this._zoomLabel.className = 'wb-zoom-label';
    this._zoomLabel.textContent = '100%';
    this._zoomLabel.title = 'Click to reset zoom';
    this._zoomLabel.addEventListener('click', () => this._zoomTo(1));
    zoomGroup.appendChild(this._zoomLabel);

    const zoomInBtn = document.createElement('button');
    zoomInBtn.className = 'wb-tool-btn';
    zoomInBtn.title = 'Zoom In (Ctrl+=)';
    zoomInBtn.textContent = '+';
    zoomInBtn.addEventListener('click', () => this._zoomBy(0.1));
    zoomGroup.appendChild(zoomInBtn);

    this._toolbar.appendChild(zoomGroup);

    // Separator
    this._toolbar.appendChild(this._makeSep());

    // SVG Export button
    this._exportSvgBtn = document.createElement('button');
    this._exportSvgBtn.className = 'wb-tool-btn';
    this._exportSvgBtn.title = 'Export as SVG';
    this._exportSvgBtn.textContent = '⎙';
    this._exportSvgBtn.addEventListener('click', () => {
      if (this._onExportSvg) this._onExportSvg();
    });
    this._toolbar.appendChild(this._exportSvgBtn);

    this._wrapper.appendChild(this._toolbar);

    // Canvas container
    this._canvasContainer = document.createElement('div');
    this._canvasContainer.className = 'wb-canvas-container';
    const canvasEl = document.createElement('canvas');
    canvasEl.id = `wb-canvas-${Date.now()}`;
    this._canvasContainer.appendChild(canvasEl);
    this._wrapper.appendChild(this._canvasContainer);
    this._canvasEl = canvasEl;
  }

  _makeSep() {
    const sep = document.createElement('div');
    sep.className = 'wb-separator';
    return sep;
  }

  // ── Canvas Init ──

  _initCanvas() {
    const rect = this._canvasContainer.getBoundingClientRect();
    const w = rect.width || 800;
    const h = rect.height || 600;

    this._canvas = new fabric.Canvas(this._canvasEl, {
      width: w,
      height: h,
      backgroundColor: this._isDark ? DARK_BG : LIGHT_BG,
      selection: true,
      preserveObjectStacking: true,
    });

    this._canvas.freeDrawingBrush = new fabric.PencilBrush(this._canvas);
    this._canvas.freeDrawingBrush.width = this._strokeWidth;
    this._canvas.freeDrawingBrush.color = this._strokeColor;

    // Track changes for dirty state and undo
    this._canvas.on('object:added', () => this._onCanvasChange());
    this._canvas.on('object:removed', () => this._onCanvasChange());
    this._canvas.on('object:modified', () => this._onCanvasChange());
    this._canvas.on('path:created', () => this._onCanvasChange());

    // Shape drawing events
    this._canvas.on('mouse:down', (e) => this._onMouseDown(e));
    this._canvas.on('mouse:move', (e) => this._onMouseMove(e));
    this._canvas.on('mouse:up', (e) => this._onMouseUp(e));

    // Zoom with mouse wheel
    this._canvas.on('mouse:wheel', (opt) => {
      const delta = opt.e.deltaY;
      let zoom = this._canvas.getZoom();
      zoom *= 0.999 ** delta;
      zoom = Math.min(Math.max(zoom, 0.1), 5);
      this._canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
      this._updateZoomLabel();
      opt.e.preventDefault();
      opt.e.stopPropagation();
    });

    // Pan with middle mouse button
    this._canvas.on('mouse:down', (opt) => {
      if (opt.e.button === 1 || this._spaceHeld) {
        this._isPanning = true;
        this._panStart = { x: opt.e.clientX, y: opt.e.clientY };
        this._canvas.defaultCursor = 'grabbing';
        this._canvas.selection = false;
        opt.e.preventDefault();
      }
    });

    this._canvas.on('mouse:move', (opt) => {
      if (this._isPanning && this._panStart) {
        const dx = opt.e.clientX - this._panStart.x;
        const dy = opt.e.clientY - this._panStart.y;
        this._canvas.relativePan({ x: dx, y: dy });
        this._panStart = { x: opt.e.clientX, y: opt.e.clientY };
        opt.e.preventDefault();
      }
    });

    this._canvas.on('mouse:up', (opt) => {
      if (this._isPanning) {
        this._isPanning = false;
        this._panStart = null;
        // Restore cursor based on active tool
        if (!this._spaceHeld) {
          this._canvas.defaultCursor = this._activeTool === 'select' ? 'default' : 'crosshair';
          if (this._activeTool === 'select') this._canvas.selection = true;
        }
      }
    });

    this._setTool('select');
    this._pushUndo(); // initial state
  }

  // ── Resize ──

  _setupResize() {
    this._resizeObserver = new ResizeObserver(() => {
      if (!this._canvas || !this._canvasContainer) return;
      const rect = this._canvasContainer.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        this._canvas.setDimensions({ width: rect.width, height: rect.height });
        this._canvas.renderAll();
      }
    });
    this._resizeObserver.observe(this._canvasContainer);
  }

  // ── Keyboard ──

  _setupKeyboard() {
    this._wrapper.addEventListener('keydown', (e) => {
      // Space for pan mode
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        this._spaceHeld = true;
        this._canvas.defaultCursor = 'grab';
        this._canvas.selection = false;
        return;
      }

      // Tool shortcuts (single key, no modifier)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const tool = TOOLS.find(t => t.key === e.key.toLowerCase());
        if (tool && document.activeElement === this._wrapper) {
          e.preventDefault();
          e.stopPropagation();
          this._setTool(tool.id);
          return;
        }
      }

      const isMod = e.ctrlKey || e.metaKey;

      // Ctrl+= / Ctrl+- for zoom
      if (isMod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        e.stopPropagation();
        this._zoomBy(0.1);
        return;
      }
      if (isMod && e.key === '-') {
        e.preventDefault();
        e.stopPropagation();
        this._zoomBy(-0.1);
        return;
      }
      // Ctrl+0 to reset zoom
      if (isMod && e.key === '0') {
        e.preventDefault();
        e.stopPropagation();
        this._zoomTo(1);
        return;
      }

      // Delete selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this._canvas.getActiveObjects().length > 0) {
          e.preventDefault();
          e.stopPropagation();
          this._deleteSelected();
          return;
        }
      }

      // Escape — deselect
      if (e.key === 'Escape') {
        e.stopPropagation();
        this._canvas.discardActiveObject();
        this._canvas.renderAll();
        return;
      }

      // Arrow nudge
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const active = this._canvas.getActiveObject();
        if (active) {
          e.preventDefault();
          e.stopPropagation();
          const step = e.shiftKey ? 10 : 1;
          if (e.key === 'ArrowUp') active.set('top', active.top - step);
          if (e.key === 'ArrowDown') active.set('top', active.top + step);
          if (e.key === 'ArrowLeft') active.set('left', active.left - step);
          if (e.key === 'ArrowRight') active.set('left', active.left + step);
          active.setCoords();
          this._canvas.renderAll();
          this._onCanvasChange();
          return;
        }
      }

      // Ctrl+A — select all
      if (isMod && e.key === 'a') {
        e.preventDefault();
        e.stopPropagation();
        this._canvas.discardActiveObject();
        const objs = this._canvas.getObjects();
        if (objs.length > 0) {
          const sel = new fabric.ActiveSelection(objs, { canvas: this._canvas });
          this._canvas.setActiveObject(sel);
          this._canvas.renderAll();
        }
        return;
      }

      // Ctrl+Z — undo
      if (isMod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        this._undo();
        return;
      }

      // Ctrl+Y or Ctrl+Shift+Z — redo
      if ((isMod && e.key === 'y') || (isMod && e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        e.stopPropagation();
        this._redo();
        return;
      }
    });

    this._wrapper.addEventListener('keyup', (e) => {
      if (e.key === ' ') {
        this._spaceHeld = false;
        if (!this._isPanning) {
          this._canvas.defaultCursor = this._activeTool === 'select' ? 'default' : 'crosshair';
          if (this._activeTool === 'select') this._canvas.selection = true;
        }
      }
    });
  }

  // ── Zoom Helpers ──

  _zoomBy(delta) {
    let zoom = this._canvas.getZoom() + delta;
    zoom = Math.min(Math.max(zoom, 0.1), 5);
    const center = this._canvas.getCenter();
    this._canvas.zoomToPoint({ x: center.left, y: center.top }, zoom);
    this._updateZoomLabel();
  }

  _zoomTo(level) {
    const center = this._canvas.getCenter();
    this._canvas.zoomToPoint({ x: center.left, y: center.top }, level);
    // Reset pan to origin
    this._canvas.setViewportTransform([level, 0, 0, level, 0, 0]);
    this._updateZoomLabel();
  }

  _updateZoomLabel() {
    const pct = Math.round(this._canvas.getZoom() * 100);
    if (this._zoomLabel) this._zoomLabel.textContent = `${pct}%`;
    if (this._onZoomChange) this._onZoomChange(pct);
  }

  // ── Tool Switching ──

  _setTool(toolId) {
    this._activeTool = toolId;
    for (const [id, btn] of Object.entries(this._toolButtons)) {
      btn.classList.toggle('active', id === toolId);
    }

    // Reset canvas interaction modes
    this._canvas.isDrawingMode = false;
    this._canvas.selection = false;
    this._canvas.defaultCursor = 'default';
    this._canvas.hoverCursor = 'default';

    // Make all objects selectable only in select mode
    const selectable = toolId === 'select';
    this._canvas.getObjects().forEach(obj => {
      obj.selectable = selectable;
      obj.evented = selectable;
    });

    if (toolId === 'select') {
      this._canvas.selection = true;
      this._canvas.defaultCursor = 'default';
      this._canvas.hoverCursor = 'move';
    } else if (toolId === 'pen') {
      this._canvas.isDrawingMode = true;
      this._canvas.freeDrawingBrush.color = this._strokeColor;
      this._canvas.freeDrawingBrush.width = this._strokeWidth;
    } else {
      this._canvas.defaultCursor = 'crosshair';
    }
  }

  // ── Shape Drawing (mouse:down/move/up) ──

  _onMouseDown(opt) {
    if (this._activeTool === 'select' || this._activeTool === 'pen') return;
    if (opt.e.button !== 0) return; // left click only

    const pointer = this._canvas.getPointer(opt.e);
    this._shapeStart = { x: pointer.x, y: pointer.y };

    if (this._activeTool === 'text') {
      const textbox = new fabric.Textbox('Text', {
        left: pointer.x,
        top: pointer.y,
        width: 150,
        fontSize: 18,
        fill: this._strokeColor,
        fontFamily: 'sans-serif',
        editable: true,
      });
      this._canvas.add(textbox);
      this._canvas.setActiveObject(textbox);
      textbox.enterEditing();
      this._setTool('select');
      this._shapeStart = null;
      return;
    }

    // Create temp shape
    const common = {
      left: pointer.x,
      top: pointer.y,
      stroke: this._strokeColor,
      strokeWidth: this._strokeWidth,
      fill: this._fillColor,
      selectable: false,
      evented: false,
    };

    if (this._activeTool === 'rect') {
      this._tempShape = new fabric.Rect({ ...common, width: 0, height: 0 });
    } else if (this._activeTool === 'ellipse') {
      this._tempShape = new fabric.Ellipse({ ...common, rx: 0, ry: 0 });
    } else if (this._activeTool === 'line') {
      this._tempShape = new fabric.Line(
        [pointer.x, pointer.y, pointer.x, pointer.y],
        { ...common, fill: undefined }
      );
    }

    if (this._tempShape) {
      this._canvas.add(this._tempShape);
    }
  }

  _onMouseMove(opt) {
    if (!this._shapeStart || !this._tempShape) return;
    const pointer = this._canvas.getPointer(opt.e);
    const sx = this._shapeStart.x;
    const sy = this._shapeStart.y;

    if (this._activeTool === 'rect') {
      const left = Math.min(sx, pointer.x);
      const top = Math.min(sy, pointer.y);
      this._tempShape.set({
        left, top,
        width: Math.abs(pointer.x - sx),
        height: Math.abs(pointer.y - sy),
      });
    } else if (this._activeTool === 'ellipse') {
      const left = Math.min(sx, pointer.x);
      const top = Math.min(sy, pointer.y);
      this._tempShape.set({
        left, top,
        rx: Math.abs(pointer.x - sx) / 2,
        ry: Math.abs(pointer.y - sy) / 2,
      });
    } else if (this._activeTool === 'line') {
      this._tempShape.set({ x2: pointer.x, y2: pointer.y });
    }

    this._tempShape.setCoords();
    this._canvas.renderAll();
  }

  _onMouseUp() {
    if (!this._shapeStart || !this._tempShape) {
      this._shapeStart = null;
      return;
    }

    // If shape is too small (accidental click), remove it
    this._tempShape.setCoords();
    const bounds = this._tempShape.getBoundingRect();
    if (bounds.width < 3 && bounds.height < 3) {
      this._canvas.remove(this._tempShape);
    } else {
      // Make it selectable now
      this._tempShape.set({ selectable: true, evented: true });
      this._canvas.setActiveObject(this._tempShape);
    }

    this._tempShape = null;
    this._shapeStart = null;
    this._canvas.renderAll();
  }

  // ── Selection Helpers ──

  _applyToSelection(prop, value) {
    const active = this._canvas.getActiveObjects();
    if (active.length === 0) return;
    for (const obj of active) {
      obj.set(prop, value);
    }
    this._canvas.renderAll();
    this._onCanvasChange();
  }

  _deleteSelected() {
    const active = this._canvas.getActiveObjects();
    if (active.length === 0) return;
    this._canvas.discardActiveObject();
    for (const obj of active) {
      this._canvas.remove(obj);
    }
    this._canvas.renderAll();
  }

  // ── Undo/Redo ──

  _pushUndo() {
    if (this._isUndoRedo) return;
    const json = JSON.stringify(this._canvas.toJSON());
    this._undoStack.push(json);
    if (this._undoStack.length > this._maxUndo) {
      this._undoStack.shift();
    }
    this._redoStack = [];
  }

  _undo() {
    if (this._undoStack.length <= 1) return; // keep at least initial state
    this._isUndoRedo = true;
    const current = this._undoStack.pop();
    this._redoStack.push(current);
    const prev = this._undoStack[this._undoStack.length - 1];
    this._canvas.loadFromJSON(prev).then(() => {
      this._canvas.renderAll();
      this._isUndoRedo = false;
      this._scheduleDirtySync();
    });
  }

  _redo() {
    if (this._redoStack.length === 0) return;
    this._isUndoRedo = true;
    const next = this._redoStack.pop();
    this._undoStack.push(next);
    this._canvas.loadFromJSON(next).then(() => {
      this._canvas.renderAll();
      this._isUndoRedo = false;
      this._scheduleDirtySync();
    });
  }

  // ── Change Tracking ──

  _onCanvasChange() {
    if (this._isUndoRedo) return;
    this._pushUndo();
    if (this._onDirty) this._onDirty();
    this._scheduleDirtySync();
  }

  _scheduleDirtySync() {
    if (this._syncTimer) clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(() => {
      if (this._syncCallback) this._syncCallback(this.toJSON());
      this._syncTimer = null;
    }, 800);
  }

  // ── Serialization ──

  toJSON() {
    if (!this._canvas) return '{}';
    return JSON.stringify(this._canvas.toJSON());
  }

  async loadFromJSON(json) {
    if (!this._canvas || !json) return;
    try {
      const data = typeof json === 'string' ? JSON.parse(json) : json;
      if (!data || typeof data !== 'object') {
        this._showError('Invalid whiteboard file: not a JSON object');
        return;
      }
      if (!data.objects) {
        this._showError('Invalid whiteboard file: missing objects array');
        return;
      }
      await this._canvas.loadFromJSON(data);
      this._canvas.renderAll();
      this._undoStack = [JSON.stringify(this._canvas.toJSON())];
      this._redoStack = [];
    } catch (err) {
      console.error('WhiteboardPanel: Failed to load JSON', err);
      this._showError(`Failed to load whiteboard: ${err.message}`);
    }
  }

  _showError(message) {
    // Show inline error overlay on the canvas
    let overlay = this._wrapper.querySelector('.wb-error');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'wb-error';
      this._canvasContainer.appendChild(overlay);
    }
    overlay.textContent = message;
    overlay.style.display = '';
    setTimeout(() => { overlay.style.display = 'none'; }, 5000);
  }

  flushSync() {
    if (this._syncTimer) {
      clearTimeout(this._syncTimer);
      this._syncTimer = null;
    }
    if (this._syncCallback) this._syncCallback(this.toJSON());
  }

  onSync(callback) {
    this._syncCallback = callback;
  }

  onZoomChange(callback) {
    this._onZoomChange = callback;
  }

  onExportSvg(callback) {
    this._onExportSvg = callback;
  }

  // ── Lifecycle ──

  show() {
    this._wrapper.style.display = '';
    if (this._canvas) {
      // Recalculate dimensions after becoming visible
      requestAnimationFrame(() => {
        const rect = this._canvasContainer.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          this._canvas.setDimensions({ width: rect.width, height: rect.height });
          this._canvas.renderAll();
        }
      });
    }
    this._wrapper.focus();
  }

  hide() {
    this._wrapper.style.display = 'none';
  }

  getElement() {
    return this._wrapper;
  }

  setTheme(isDark) {
    this._isDark = isDark;
    if (this._canvas) {
      this._canvas.backgroundColor = isDark ? DARK_BG : LIGHT_BG;
      this._canvas.renderAll();
    }
  }

  getZoom() {
    return this._canvas ? Math.round(this._canvas.getZoom() * 100) : 100;
  }

  exportSvg() {
    if (!this._canvas) return '';
    return this._canvas.toSVG();
  }

  dispose() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._syncTimer) {
      clearTimeout(this._syncTimer);
      this._syncTimer = null;
    }
    if (this._canvas) {
      this._canvas.dispose();
      this._canvas = null;
    }
    if (this._wrapper && this._wrapper.parentElement) {
      this._wrapper.parentElement.removeChild(this._wrapper);
    }
  }
}
