export function activate(api) {
  function showChecksums() {
    const tabId = api.tabs.getActiveId();
    const tab = api.tabs.getTab(tabId);
    if (!tab || !tab.filePath) {
      alert('Save the file first to calculate checksums.');
      return;
    }
    openChecksumDialog(tab.filePath);
  }

  async function openChecksumDialog(filePath) {
    // Remove existing dialog
    const existing = document.querySelector('.checksum-dialog-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'checksum-dialog-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center; z-index: 10000;
    `;

    const dialog = document.createElement('div');
    dialog.className = 'checksum-dialog';
    dialog.style.cssText = `
      background: var(--bg-color, #1e1e1e); color: var(--text-color, #d4d4d4);
      border: 1px solid var(--border-color, #444); border-radius: 6px;
      padding: 20px; min-width: 560px; max-width: 700px;
      font-family: system-ui, sans-serif; font-size: 13px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    `;

    const fileName = filePath.split('/').pop().split('\\').pop();
    dialog.innerHTML = `
      <h3 style="margin:0 0 4px; font-size:15px;">Checksums</h3>
      <div style="color:#999; margin-bottom:16px; word-break:break-all; font-size:12px;">${escapeHtml(filePath)}</div>
      <div class="checksum-results" style="display:flex; flex-direction:column; gap:10px;">
        <div class="checksum-loading" style="text-align:center; padding:20px; color:#888;">Calculating hashes...</div>
      </div>
      <div style="margin-top:16px; border-top:1px solid var(--border-color, #444); padding-top:12px;">
        <label style="display:block; margin-bottom:4px; font-size:12px; color:#888;">Compare hash:</label>
        <div style="display:flex; gap:8px;">
          <input type="text" class="checksum-compare-input" placeholder="Paste expected hash to verify..."
            style="flex:1; padding:6px 8px; background:var(--input-bg, #2d2d2d); color:var(--text-color, #d4d4d4);
            border:1px solid var(--border-color, #555); border-radius:4px; font-family:monospace; font-size:12px;">
          <span class="checksum-compare-result" style="display:flex; align-items:center; font-size:16px; min-width:24px;"></span>
        </div>
      </div>
      <div style="margin-top:16px; text-align:right;">
        <button class="checksum-close-btn" style="padding:6px 16px; background:#555; color:#fff;
          border:none; border-radius:4px; cursor:pointer;">Close</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Close handlers
    const closeBtn = dialog.querySelector('.checksum-close-btn');
    closeBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onEsc); }
    });

    // Calculate hashes
    try {
      const hashes = await window.api.calculateChecksums(filePath);
      const resultsContainer = dialog.querySelector('.checksum-results');
      resultsContainer.innerHTML = '';

      const algos = ['md5', 'sha1', 'sha256', 'sha512'];
      const labels = { md5: 'MD5', sha1: 'SHA-1', sha256: 'SHA-256', sha512: 'SHA-512' };

      for (const algo of algos) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; gap:8px;';
        row.innerHTML = `
          <span style="min-width:60px; font-weight:600; font-size:12px; color:#888;">${labels[algo]}</span>
          <code style="flex:1; font-size:11px; word-break:break-all; background:var(--input-bg, #2d2d2d);
            padding:4px 8px; border-radius:3px; user-select:all;">${hashes[algo]}</code>
          <button class="copy-hash-btn" data-hash="${hashes[algo]}" title="Copy"
            style="padding:4px 8px; background:none; border:1px solid var(--border-color, #555);
            border-radius:3px; cursor:pointer; color:var(--text-color, #d4d4d4); font-size:11px;">Copy</button>
        `;
        resultsContainer.appendChild(row);
      }

      // Copy buttons
      resultsContainer.querySelectorAll('.copy-hash-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          navigator.clipboard.writeText(btn.dataset.hash);
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
        });
      });

      // Compare input
      const compareInput = dialog.querySelector('.checksum-compare-input');
      const compareResult = dialog.querySelector('.checksum-compare-result');
      const allHashes = Object.values(hashes).map(h => h.toLowerCase());

      compareInput.addEventListener('input', () => {
        const val = compareInput.value.trim().toLowerCase();
        if (!val) {
          compareResult.textContent = '';
          return;
        }
        if (allHashes.includes(val)) {
          compareResult.innerHTML = '<span style="color:#4caf50; font-size:20px;">&#10003;</span>';
        } else {
          compareResult.innerHTML = '<span style="color:#f44336; font-size:20px;">&#10007;</span>';
        }
      });

    } catch (err) {
      const resultsContainer = dialog.querySelector('.checksum-results');
      resultsContainer.innerHTML = `<div style="color:#f44336;">Error: ${escapeHtml(err.message || String(err))}</div>`;
    }
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  api.registerCommand({
    id: 'checksums.show',
    title: 'Checksums',
    handler: showChecksums,
  });

  return {
    showChecksums,
    deactivate() {},
  };
}
