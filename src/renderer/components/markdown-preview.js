import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

/**
 * Renders markdown content as sanitized HTML in the editor container.
 * Used when a .md tab is in Read mode.
 */
export class MarkdownPreview {
  constructor(container) {
    this.container = container;
    this.md = new MarkdownIt({ html: true, linkify: true, typographer: true });
    this.scrollTop = 0;
  }

  render(markdownContent, filePath) {
    const rawHtml = this.md.render(markdownContent);
    const clean = DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        'h1','h2','h3','h4','h5','h6','p','a','img','ul','ol','li',
        'code','pre','blockquote','table','thead','tbody','tr','th','td',
        'strong','em','del','br','hr','input','span','div',
      ],
      ALLOWED_ATTR: ['href','src','alt','title','class','type','checked','disabled'],
      ALLOW_DATA_ATTR: false,
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'mdp-content';
    wrapper.innerHTML = clean;

    this._resolveImagePaths(wrapper, filePath);

    // Open links in system browser
    wrapper.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link && link.href) {
        e.preventDefault();
        window.api.openExternal(link.href);
      }
    });

    this.container.innerHTML = '';
    this.container.appendChild(wrapper);
    wrapper.scrollTop = this.scrollTop;
  }

  saveScrollPosition() {
    const wrapper = this.container.querySelector('.mdp-content');
    if (wrapper) this.scrollTop = wrapper.scrollTop;
  }

  _resolveImagePaths(wrapper, filePath) {
    if (!filePath) return;
    const fileDir = filePath.substring(0, filePath.lastIndexOf('/'));

    wrapper.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (!src) return;
      // Skip anything with a protocol or protocol-relative URL
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(src) || src.startsWith('//')) return;
      // Resolve relative path from file's directory
      const resolved = fileDir + '/' + src;
      img.src = 'local-image://' + encodeURIComponent(resolved);
    });
  }

  destroy() {
    this.saveScrollPosition();
    this.container.innerHTML = '';
  }
}
