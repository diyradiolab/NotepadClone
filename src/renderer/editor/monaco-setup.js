import * as monaco from 'monaco-editor';

// Define Notepad++ classic theme (light)
monaco.editor.defineTheme('notepadpp', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '008000' },
    { token: 'keyword', foreground: '0000FF', fontStyle: 'bold' },
    { token: 'string', foreground: '808080' },
    { token: 'number', foreground: 'FF8000' },
    { token: 'type', foreground: '8000FF' },
    { token: 'function', foreground: '000080' },
    { token: 'variable', foreground: '000000' },
    { token: 'operator', foreground: '000080' },
    { token: 'delimiter', foreground: '000000' },
    { token: 'tag', foreground: '0000FF' },
    { token: 'attribute.name', foreground: 'FF0000' },
    { token: 'attribute.value', foreground: '808080' },
  ],
  colors: {
    'editor.background': '#FFFFFF',
    'editor.foreground': '#000000',
    'editor.lineHighlightBackground': '#E8E8FF',
    'editor.selectionBackground': '#ADD6FF',
    'editor.inactiveSelectionBackground': '#D4D4D4',
    'editorLineNumber.foreground': '#808080',
    'editorLineNumber.activeForeground': '#000000',
    'editorIndentGuide.background': '#D0D0D0',
    'editorGutter.background': '#F0F0F0',
    'editorCursor.foreground': '#000000',
    'editor.findMatchBackground': '#FFFF00',
    'editor.findMatchHighlightBackground': '#FFFF0066',
  },
});

// Define Notepad++ dark theme
monaco.editor.defineTheme('notepadpp-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6A9955' },
    { token: 'keyword', foreground: '569CD6', fontStyle: 'bold' },
    { token: 'string', foreground: 'CE9178' },
    { token: 'number', foreground: 'B5CEA8' },
    { token: 'type', foreground: '4EC9B0' },
    { token: 'function', foreground: 'DCDCAA' },
    { token: 'variable', foreground: '9CDCFE' },
    { token: 'operator', foreground: 'D4D4D4' },
    { token: 'delimiter', foreground: 'D4D4D4' },
    { token: 'tag', foreground: '569CD6' },
    { token: 'attribute.name', foreground: '9CDCFE' },
    { token: 'attribute.value', foreground: 'CE9178' },
  ],
  colors: {
    'editor.background': '#1E1E1E',
    'editor.foreground': '#D4D4D4',
    'editor.lineHighlightBackground': '#2A2D2E',
    'editor.selectionBackground': '#264F78',
    'editor.inactiveSelectionBackground': '#3A3D41',
    'editorLineNumber.foreground': '#858585',
    'editorLineNumber.activeForeground': '#C6C6C6',
    'editorIndentGuide.background': '#404040',
    'editorGutter.background': '#1E1E1E',
    'editorCursor.foreground': '#AEAFAD',
    'editor.findMatchBackground': '#515C6A',
    'editor.findMatchHighlightBackground': '#EA5C0055',
  },
});

let currentTheme = 'notepadpp';

export function setEditorTheme(themeName) {
  currentTheme = themeName;
  monaco.editor.setTheme(themeName);
}

const DEFAULT_OPTIONS = {
  theme: currentTheme,
  fontSize: 14,
  fontFamily: "'Courier New', Consolas, 'Liberation Mono', monospace",
  lineNumbers: 'on',
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  renderWhitespace: 'none',
  wordWrap: 'off',
  automaticLayout: true,
  tabSize: 4,
  insertSpaces: false,
  cursorBlinking: 'blink',
  cursorStyle: 'line',
  smoothScrolling: true,
  mouseWheelZoom: true,
  folding: true,
  glyphMargin: false,
  renderLineHighlight: 'all',
  columnSelection: false,
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  acceptSuggestionOnEnter: 'off',
  parameterHints: { enabled: false },
};

export function createEditor(container, options = {}) {
  const editorOptions = { ...DEFAULT_OPTIONS, theme: currentTheme, ...options };

  // If a model is provided, don't set value/language (they conflict with model)
  if (!options.model) {
    editorOptions.value = options.value || '';
    editorOptions.language = options.language || 'plaintext';
  }

  return monaco.editor.create(container, editorOptions);
}

export function detectLanguage(filename) {
  if (!filename) return 'plaintext';
  const ext = filename.split('.').pop().toLowerCase();
  const map = {
    js: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    py: 'python',
    rb: 'ruby',
    java: 'java',
    c: 'c', h: 'c',
    cpp: 'cpp', cxx: 'cpp', cc: 'cpp', hpp: 'cpp',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    php: 'php',
    html: 'html', htm: 'html',
    css: 'css', scss: 'css', less: 'css',
    json: 'json',
    xml: 'xml', svg: 'xml',
    yaml: 'yaml', yml: 'yaml',
    md: 'markdown',
    sql: 'sql',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    bat: 'bat', cmd: 'bat',
    ps1: 'powershell',
    txt: 'plaintext',
    log: 'plaintext',
    ini: 'ini',
    toml: 'ini',
    dockerfile: 'dockerfile',
    makefile: 'plaintext',
  };
  return map[ext] || 'plaintext';
}

export function getLanguageDisplayName(languageId) {
  const names = {
    plaintext: 'Plain Text',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    python: 'Python',
    ruby: 'Ruby',
    java: 'Java',
    c: 'C',
    cpp: 'C++',
    csharp: 'C#',
    go: 'Go',
    rust: 'Rust',
    php: 'PHP',
    html: 'HTML',
    css: 'CSS',
    json: 'JSON',
    xml: 'XML',
    yaml: 'YAML',
    markdown: 'Markdown',
    sql: 'SQL',
    shell: 'Shell Script',
    bat: 'Batch',
    powershell: 'PowerShell',
    ini: 'INI',
    dockerfile: 'Dockerfile',
  };
  return names[languageId] || languageId;
}

export { monaco };
