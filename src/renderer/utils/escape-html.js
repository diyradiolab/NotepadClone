const _div = document.createElement('div');

export function escapeHtml(text) {
  _div.textContent = text;
  return _div.innerHTML;
}
