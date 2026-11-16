/* Local line icons. Paths are fixed application assets, never clipboard content. */
(() => {
  const paths = {
    settings: '<path d="m9.5 3-.7 2.1-1.9 1.1-2.2-.4-2 3.4 1.5 1.7v2.2L2.7 15l2 3.4 2.2-.4 1.9 1.1.7 2.1h4l.7-2.1 1.9-1.1 2.2.4 2-3.4-1.5-1.7v-2.2l1.5-1.7-2-3.4-2.2.4-1.9-1.1-.7-2.1Z"/><circle cx="11.5" cy="12.1" r="3"/>', 
    text: '<path d="M5 5h14M5 10h14M5 15h9M5 20h6"/>',
    url: '<path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(0 -1) scale(.95)"/>',
    color: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none"/>',
    code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16"/>',
    email: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
    phone: '<path d="m8 3 3 5-3 3a13 13 0 0 0 5 5l3-3 5 3c0 4-3 6-6 4A24 24 0 0 1 4 9C2 6 4 3 8 3Z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
    clipboard: '<rect x="5" y="4" width="14" height="18" rx="3"/><rect x="9" y="2" width="6" height="4" rx="1.5" fill="var(--bg-window)"/><path d="M9 11h6m-6 4h6"/>',
    pin: '<path d="m9 3 8 0-1 6 3 4H6l3-4V3m3 10v8"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    chart: '<path d="M5 20V10m7 10V4m7 16v-7"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18M10 10v10"/>',
  };
  window.ClipIcons = Object.fromEntries(Object.entries(paths).map(([name, path]) => [name,
    `<svg class="line-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`
  ]));
})();
