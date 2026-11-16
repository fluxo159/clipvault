/**
 * renderer.js — UI логика ClipVault
 * Рендеринг, поиск, фильтры, анимации
 */

// ===== DOM Elements =====
const elements = {
  clipList: document.getElementById('clip-list'),
  searchInput: document.getElementById('search-input'),
  tabs: document.querySelectorAll('.tab'),
  countAll: document.getElementById('count-all'),
  countPinned: document.getElementById('count-pinned'),
  statsView: document.getElementById('stats-view'),
  emptyState: document.getElementById('empty-state'),
  statusInfo: document.getElementById('status-info'),
  statusShortcut: document.getElementById('status-shortcut'),
  btnExport: document.getElementById('btn-export'),
  btnClear: document.getElementById('btn-clear'),
  btnSettings: document.getElementById('btn-settings'),
  exportModal: document.getElementById('export-modal'),
  modalClose: document.getElementById('modal-close'),
  confirmDialog: document.getElementById('confirm-dialog'),
  confirmTitle: document.getElementById('confirm-title'),
  confirmText: document.getElementById('confirm-text'),
  confirmCancel: document.getElementById('confirm-cancel'),
  confirmOk: document.getElementById('confirm-ok'),
  toast: document.getElementById('toast'),
  toastText: document.getElementById('toast-text'),
  // Stats
  statTotal: document.getElementById('stat-total'),
  statToday: document.getElementById('stat-today'),
  statPastes: document.getElementById('stat-pastes'),
  statPinnedCount: document.getElementById('stat-pinned-count'),
  activityChart: document.getElementById('activity-chart'),
  typeStats: document.getElementById('type-stats'),
  topUsed: document.getElementById('top-used'),
  // Settings
  settingsModal: document.getElementById('settings-modal'),
  themeSelect: document.getElementById('theme-select'),
  settingsClose: document.getElementById('settings-close'),
  shortcutRecorder: document.getElementById('shortcut-recorder'),
  shortcutDisplay: document.getElementById('shortcut-display'),
  shortcutKeys: document.getElementById('shortcut-keys'),
  shortcutStatus: document.getElementById('shortcut-status'),
  btnResetShortcut: document.getElementById('btn-reset-shortcut'),
  btnSaveShortcut: document.getElementById('btn-save-shortcut'),
  btnCancelShortcut: document.getElementById('btn-cancel-shortcut'),
  autostartToggle: document.getElementById('autostart-toggle'),
  widgetToggle: document.getElementById('widget-toggle'),
  historyLimitSlider: document.getElementById('history-limit-slider'),
  historyLimitValue: document.getElementById('history-limit-value'),
  btnSaveLimit: document.getElementById('btn-save-limit'),
};

// ===== State =====
let allClips = [];       // полный массив
let filteredClips = [];  // после поиска/фильтра
let currentTab = 'all';
let searchQuery = '';
let currentTypeFilter = 'all';
let renderOffset = 0;    // virtual scroll
const PAGE_SIZE = 25;    // сколько рендерим за раз
let isLoadingMore = false;
let state = {
  theme: 'dark',
};

// ===== Type Info Maps =====
const TYPE_ICONS = window.ClipIcons;

const TYPE_LABELS = {
  url: 'Ссылка',
  color: 'Цвет',
  code: 'Код',
  email: 'Email',
  phone: 'Телефон',
  image: 'Изображение',
  text: 'Текст'
};

// ===== Initialization =====
async function init() {
  document.querySelectorAll('[data-icon]').forEach(el => {
    el.innerHTML = TYPE_ICONS[el.dataset.icon] || TYPE_ICONS.text;
  });
  const settings = await window.clipVault.getSettings();
  elements.statusShortcut.textContent = electronShortcutToDisplay(settings.shortcut);

  // Получаем тему
  state.theme = await window.clipVault.getTheme();
  applyTheme(state.theme);

  // Загружаем историю
  allClips = await window.clipVault.getHistory();
  renderClips();
  updateStatusBar();

  // Подписываемся на события
  window.clipVault.onHistoryChanged((history) => {
    allClips = history;
    renderClips();
    updateStatusBar();
  });

  window.clipVault.onThemeChanged((theme) => {
    state.theme = theme;
    applyTheme(theme);
  });

  window.clipVault.onWindowShow(() => {
    if (!document.getElementById('header').classList.contains('hidden')) elements.searchInput.focus();
  });

  // Подписываемся на UI события
  setupEventListeners();
  setupSearch();
}

// ===== Theme =====
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

// ===== Virtual Scroll =====
function renderPage(reset = false) {
  if (reset) {
    renderOffset = 0;
    elements.clipList.innerHTML = '';
  }

  const end = Math.min(renderOffset + PAGE_SIZE, filteredClips.length);
  const fragment = document.createDocumentFragment();

  for (let i = renderOffset; i < end; i++) {
    fragment.appendChild(createClipElement(filteredClips[i], i));
  }

  elements.clipList.appendChild(fragment);
  renderOffset = end;

  // Убираем sentinel если всё загружено
  const existing = elements.clipList.querySelector('.scroll-sentinel');
  if (existing) existing.remove();

  if (renderOffset < filteredClips.length) {
    const sentinel = document.createElement('div');
    sentinel.className = 'scroll-sentinel';
    elements.clipList.appendChild(sentinel);
    observeSentinel(sentinel);
  }
}

let sentinelObserver = null;
function observeSentinel(el) {
  if (sentinelObserver) sentinelObserver.disconnect();
  sentinelObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoadingMore) {
      isLoadingMore = true;
      renderPage(false);
      isLoadingMore = false;
    }
  }, { root: elements.clipList, threshold: 0.1 });
  sentinelObserver.observe(el);
}

// ===== Render Clips List =====
function renderClips() {
  document.getElementById('type-filters').classList.toggle('hidden', currentTab === 'stats');
  if (currentTab === 'stats') {
    elements.clipList.classList.add('hidden');
    elements.emptyState.classList.add('hidden');
    elements.statsView.classList.remove('hidden');
    renderStats();
    return;
  }

  elements.statsView.classList.add('hidden');
  const pinned = allClips.filter(c => c.pinned);
  let base = currentTab === 'pinned' ? pinned : allClips;

  document.getElementById('filter-count').textContent = base.length;
  if (currentTypeFilter !== 'all') {
    base = base.filter(item => currentTypeFilter === 'text'
      ? item.type !== 'image' && item.type !== 'url'
      : item.type === currentTypeFilter);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    base = base.filter(c =>
      c.content.toLowerCase().includes(q) ||
      (c.metadata?.domain && c.metadata.domain.toLowerCase().includes(q)) ||
      (c.type && c.type.toLowerCase().includes(q))
    );
  }

  filteredClips = base;

  // Счётчики
  elements.countAll.textContent = allClips.length;
  elements.countPinned.textContent = pinned.length;

  // Пустое состояние
  if (filteredClips.length === 0) {
    elements.clipList.replaceChildren();
    elements.emptyState.querySelector('.empty-title').textContent = searchQuery ? 'Ничего не найдено' : 'Ваш буфер. Всё под рукой.';
    elements.emptyState.querySelector('.empty-text').textContent = searchQuery ? 'Попробуйте другой запрос' : 'Скопируйте текст или изображение. Мы сохраним его здесь.';
    elements.emptyState.classList.remove('hidden');
    elements.clipList.classList.add('hidden');
    renderOffset = 0;
  } else {
    elements.emptyState.classList.add('hidden');
    elements.clipList.classList.remove('hidden');
    renderPage(true);
  }
}

// ===== Create Clip Element =====
function createClipElement(item, index) {
  const el = document.createElement('div');
  el.className = `clip-item${item.pinned ? ' pinned' : ''}`;
  el.dataset.id = item.id;
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `Скопировать: ${truncate(item.content, 80)}`);
  el.addEventListener('keydown', e => {
    if (e.target === el && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      copyItem(item);
    }
  });
  if (index === 0 && Date.now() - item.timestamp < 5000) {
    el.classList.add('new-item');
  }

  // Type Icon
  const typeEl = document.createElement('div');
  typeEl.className = 'clip-type';
  typeEl.dataset.type = item.type;
  typeEl.innerHTML = TYPE_ICONS[item.type] || TYPE_ICONS.text;

  // Content Area
  const contentEl = document.createElement('div');
  contentEl.className = 'clip-content';

  // Main content rendering based on type
  if (item.type === 'image') {
    contentEl.appendChild(renderImageContent(item));
  } else if (item.type === 'color') {
    contentEl.appendChild(renderColorContent(item));
  } else if (item.type === 'url') {
    contentEl.appendChild(renderUrlContent(item));
  } else if (item.type === 'code') {
    const textEl = document.createElement('div');
    textEl.className = 'clip-text clip-text-code';
    textEl.textContent = item.content;
    contentEl.appendChild(textEl);
  } else {
    const textEl = document.createElement('div');
    textEl.className = 'clip-text';
    textEl.textContent = item.content;
    contentEl.appendChild(textEl);
  }

  // Meta line
  const metaEl = document.createElement('div');
  metaEl.className = 'clip-meta';

  const typeLabel = document.createElement('span');
  typeLabel.className = 'clip-meta-type';
  typeLabel.dataset.type = item.type;
  typeLabel.textContent = TYPE_LABELS[item.type] || 'Текст';
  metaEl.appendChild(typeLabel);

  const dot = document.createElement('span');
  dot.className = 'clip-dot';
  metaEl.appendChild(dot);

  const timeEl = document.createElement('span');
  timeEl.textContent = formatRelativeTime(item.timestamp);
  metaEl.appendChild(timeEl);

  if (item.metadata?.length || item.metadata?.words) {
    const dot2 = document.createElement('span');
    dot2.className = 'clip-dot';
    metaEl.appendChild(dot2);
    const infoEl = document.createElement('span');
    if (item.metadata.words) {
      infoEl.textContent = `${item.metadata.words} сл.`;
    } else if (item.metadata.lines > 1) {
      infoEl.textContent = `${item.metadata.lines} стр.`;
    }
    metaEl.appendChild(infoEl);
  }

  contentEl.appendChild(metaEl);

  // Actions
  const actionsEl = document.createElement('div');
  actionsEl.className = 'clip-actions';

  const pinBtn = document.createElement('button');
  pinBtn.className = `clip-action-btn${item.pinned ? ' pin-active' : ''}`;
  pinBtn.innerHTML = TYPE_ICONS.pin;
  pinBtn.title = item.pinned ? 'Открепить' : 'Закрепить';
  pinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePin(item.id);
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'clip-action-btn delete-btn';
  deleteBtn.innerHTML = TYPE_ICONS.close;
  deleteBtn.title = 'Удалить';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteItem(item.id, el);
  });

  actionsEl.appendChild(pinBtn);
  actionsEl.appendChild(deleteBtn);

  // Assemble
  el.appendChild(typeEl);
  el.appendChild(contentEl);
  el.appendChild(actionsEl);

  // Click to copy
  el.addEventListener('click', () => {
    copyItem(item);
  });

  return el;
}

// ===== Render Image Content =====
function renderImageContent(item) {
  const container = document.createElement('div');
  container.className = 'clip-image-preview';

  const src = item.thumbDataURL || item.thumbnailDataURL || item.imageDataURL;
  if (src) {
    const img = document.createElement('img');
    img.className = 'clip-image-thumb';
    img.src = src;
    img.alt = 'Изображение';
    img.loading = 'lazy';
    img.decoding = 'async';
    container.appendChild(img);
  }

  const info = document.createElement('div');
  info.className = 'clip-image-info';

  if (item.metadata?.width && item.metadata?.height) {
    const dims = document.createElement('span');
    dims.className = 'clip-image-dims';
    dims.textContent = `${item.metadata.width} × ${item.metadata.height}`;
    info.appendChild(dims);
  }

  if (item.metadata?.sizeKB) {
    const size = document.createElement('span');
    size.className = 'clip-image-size';
    const kb = item.metadata.sizeKB;
    size.textContent = kb >= 1024 ? `${(kb/1024).toFixed(1)} МБ` : `${kb} КБ`;
    info.appendChild(size);
  }

  container.appendChild(info);
  return container;
}

// ===== Render Color Content =====
function renderColorContent(item) {
  const container = document.createElement('div');
  container.className = 'clip-color-preview';

  const swatch = document.createElement('div');
  swatch.className = 'color-swatch';
  swatch.style.backgroundColor = item.metadata?.hex || item.metadata?.color || item.content;

  const value = document.createElement('span');
  value.className = 'color-value';
  value.textContent = item.content;

  container.appendChild(swatch);
  container.appendChild(value);
  return container;
}

// ===== Render URL Content =====
function renderUrlContent(item) {
  const container = document.createElement('div');

  const textEl = document.createElement('div');
  textEl.className = 'clip-text';
  textEl.textContent = item.content;
  container.appendChild(textEl);

  if (item.metadata?.domain) {
    const preview = document.createElement('div');
    preview.className = 'clip-url-preview';

    const domain = document.createElement('span');
    domain.className = 'clip-domain';
    domain.textContent = item.metadata.domain;

    preview.appendChild(domain);
    container.appendChild(preview);
  }

  return container;
}

// ===== Actions =====
async function copyItem(item) {
  if (item.type === 'image') {
    const payload = {
      text: item.content,
      imagePath: item.imagePath,
      imageDataURL: item.imageDataURL
    };
    await window.clipVault.copyToClipboard(payload);
  } else {
    await window.clipVault.copyToClipboard(item.content);
  }
  showToast(item.type === 'image' ? 'Изображение скопировано!' : 'Скопировано!');
  setTimeout(() => window.clipVault.hideWindow(), 300);
}

async function togglePin(id) {
  allClips = await window.clipVault.togglePin(id);
  renderClips();
  updateStatusBar();
}

async function deleteItem(id, element) {
  // Анимация удаления
  element.classList.add('removing');
  await new Promise(resolve => setTimeout(resolve, 200));

  allClips = await window.clipVault.deleteItem(id);
  renderClips();
  updateStatusBar();
}

async function clearHistory() {
  allClips = await window.clipVault.clearHistory();
  renderClips();
  updateStatusBar();
  showToast('История очищена');
}

// ===== Debounced Search =====
let searchTimeout = null;
function setupSearch() {
  elements.searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchQuery = e.target.value.trim();
      renderClips();
    }, 150); // 150ms debounce
  });

  // Горячая клавиша Cmd+F
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f' && !recorderState?.isRecording) {
      e.preventDefault();
      document.getElementById('header').classList.remove('hidden');
      elements.searchInput.focus();
    }
    if (e.defaultPrevented) return;
    if (e.key === 'Escape' && document.activeElement === elements.searchInput) {
      elements.searchInput.blur();
      document.getElementById('header').classList.add('hidden');
      elements.searchInput.value = '';
      searchQuery = '';
      renderClips();
    }
  });
}

// ===== Update Status Bar =====
function updateStatusBar() {
  const count = allClips.length;
  const pinned = allClips.filter(h => h.pinned).length;
  elements.statusInfo.textContent = `${count} элемент${getPlural(count)} · ${pinned} закреплён${getPlural(pinned)}`;
}

// ===== Stats =====
async function renderStats() {
  try {
    const stats = await window.clipVault.getStats();

    // Cards
    elements.statTotal.textContent = formatNumber(stats.totalClips);
    elements.statToday.textContent = formatNumber(stats.todayCount);
    elements.statPastes.textContent = formatNumber(stats.totalPastes);
    elements.statPinnedCount.textContent = formatNumber(stats.pinnedCount);

    // Activity Chart
    renderActivityChart(stats.last7Days, stats.maxDayCount);

    // Type Stats
    renderTypeStats(stats.byType, stats.totalClips);

    // Top Used
    renderTopUsed(stats.topUsed);
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

function renderActivityChart(days, maxCount) {
  const svg = elements.activityChart;
  const width = 370;
  const height = 120;
  const barWidth = 36;
  const gap = (width - 7 * barWidth) / 8;
  const chartHeight = 76;
  const topPadding = 17;

  let svgContent = '';

  days.forEach((day, i) => {
    const x = gap + i * (barWidth + gap);
    const normalizedHeight = maxCount > 0 ? (day.count / maxCount) * chartHeight : 0;
    const barHeight = Math.max(normalizedHeight, 2);
    const y = topPadding + chartHeight - barHeight;

    // Background bar
    svgContent += `<rect class="chart-bar-bg" x="${x}" y="${topPadding}" width="${barWidth}" height="${chartHeight}" rx="4"/>`;

    // Value bar
    svgContent += `<rect class="chart-bar" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4"/>`;

    // Value label
    if (day.count > 0) {
      svgContent += `<text class="chart-value" x="${x + barWidth / 2}" y="${y - 4}">${day.count}</text>`;
    }

    // Day label
    svgContent += `<text class="chart-label" x="${x + barWidth / 2}" y="${height - 2}">${day.label}</text>`;
  });

  svg.innerHTML = svgContent;
}

function renderTypeStats(byType, total) {
  const types = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  const maxTypeCount = types.length > 0 ? types[0][1] : 1;

  if (types.length === 0) {
    elements.typeStats.innerHTML = '<div class="empty-text">Нет данных</div>';
    return;
  }

  elements.typeStats.innerHTML = types.map(([type, count]) => {
    return `
      <div class="type-stat-row">
        <span class="type-stat-icon">${TYPE_ICONS[type] || TYPE_ICONS.text}</span>
        <span class="type-stat-label">${TYPE_LABELS[type] || type}</span>
        <span class="type-stat-count">${count}</span>
        <div class="type-stat-bar-container">
          <div class="type-stat-bar"></div>
        </div>
      </div>
    `;
  }).join('');
  elements.typeStats.querySelectorAll('.type-stat-bar').forEach((bar, index) => {
    bar.style.width = `${(types[index][1] / maxTypeCount) * 100}%`;
  });
}

function renderTopUsed(topUsed) {
  if (!topUsed || topUsed.length === 0) {
    elements.topUsed.innerHTML = '<div class="empty-text">Начните использовать ClipVault</div>';
    return;
  }

  elements.topUsed.innerHTML = topUsed.map((item, i) => `
    <div class="top-used-item" data-content="${escapeHtml(item.content)}">
      <span class="top-used-rank">${i + 1}</span>
      <span class="top-used-text">${escapeHtml(truncate(item.content, 40))}</span>
      <span class="top-used-count">×${item.usageCount}</span>
    </div>
  `).join('');

  // Click to copy
  elements.topUsed.querySelectorAll('.top-used-item').forEach(el => {
    el.addEventListener('click', async () => {
      await window.clipVault.copyToClipboard(el.dataset.content);
      showToast('Скопировано!');
    });
  });
}

// ===== Event Listeners =====
function setupEventListeners() {
  document.querySelectorAll('.type-filter').forEach(button => {
    button.addEventListener('click', () => {
      currentTypeFilter = button.dataset.filter;
      document.querySelectorAll('.type-filter').forEach(filter => {
        const active = filter === button;
        filter.classList.toggle('active', active);
        filter.setAttribute('aria-pressed', String(active));
      });
      renderClips();
    });
  });
  // Tabs
  elements.tabs.forEach(tab => {
    tab.setAttribute('aria-pressed', String(tab.classList.contains('active')));
    tab.addEventListener('click', () => {
      elements.tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-pressed', 'false'); });
      tab.setAttribute('aria-pressed', 'true');
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      renderClips();
    });
  });

  // Export button
  elements.btnExport.addEventListener('click', () => {
    closeSettings();
    elements.exportModal.classList.remove('hidden');
  });

  // Export modal close
  elements.modalClose.addEventListener('click', () => {
    elements.exportModal.classList.add('hidden');
  });

  // Export modal backdrop
  elements.exportModal.querySelector('.modal-backdrop').addEventListener('click', () => {
    elements.exportModal.classList.add('hidden');
  });

  // Export format buttons
  elements.exportModal.querySelectorAll('.export-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const format = btn.dataset.format;
      elements.exportModal.classList.add('hidden');
      const result = await window.clipVault.exportHistory(format);
      if (result.success) {
        showToast(`Экспортировано: ${format.toUpperCase()}`);
      }
    });
  });

  // Clear button
  elements.btnClear.addEventListener('click', () => {
    showConfirmDialog(
      'Очистить историю?',
      'Все незакреплённые элементы будут удалены. Закреплённые останутся.',
      async () => {
        await clearHistory();
      }
    );
  });

  // Keyboard shortcuts (general)
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || recorderState.isRecording) return;
    if (e.key === 'Escape') {
      for (const modal of [elements.settingsModal, elements.confirmDialog, elements.exportModal]) {
        if (!modal.classList.contains('hidden')) {
          e.preventDefault();
          if (modal === elements.settingsModal) closeSettings();
          else modal.classList.add('hidden');
          return;
        }
      }
      if (document.activeElement !== elements.searchInput) window.clipVault.hideWindow();
    }
  });

  // Confirm dialog
  elements.confirmCancel.addEventListener('click', () => {
    elements.confirmDialog.classList.add('hidden');
  });

  elements.confirmDialog.querySelector('.modal-backdrop').addEventListener('click', () => {
    elements.confirmDialog.classList.add('hidden');
  });

  // Settings
  setupSettingsListeners();
}

// ===== Confirm Dialog =====
let confirmCallback = null;

function showConfirmDialog(title, text, callback) {
  elements.confirmTitle.textContent = title;
  elements.confirmText.textContent = text;
  confirmCallback = callback;
  elements.confirmDialog.classList.remove('hidden');

  elements.confirmOk.onclick = async () => {
    elements.confirmDialog.classList.add('hidden');
    if (confirmCallback) await confirmCallback();
    confirmCallback = null;
  };
}

// ===== Toast =====
let toastTimeout = null;

function showToast(message) {
  elements.toastText.textContent = message;
  elements.toast.classList.remove('hidden');

  // Trigger reflow for animation
  void elements.toast.offsetWidth;
  elements.toast.classList.add('visible');

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    elements.toast.classList.remove('visible');
    setTimeout(() => {
      elements.toast.classList.add('hidden');
    }, 250);
  }, 1500);
}

// ===== Utility Functions =====

function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 10) return 'только что';
  if (seconds < 60) return `${seconds} сек. назад`;
  if (minutes < 60) return `${minutes} мин. назад`;
  if (hours < 24) return `${hours} ч. назад`;
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} дн. назад`;

  return new Date(timestamp).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short'
  });
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num);
}

function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '…';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getPlural(n) {
  // Simplified Russian plural suffix
  const abs = Math.abs(n) % 100;
  const lastDigit = abs % 10;
  if (abs > 10 && abs < 20) return 'ов';
  if (lastDigit === 1) return '';
  if (lastDigit >= 2 && lastDigit <= 4) return 'а';
  return 'ов';
}

// ===== Settings Panel =====

// Состояние рекордера
const recorderState = {
  isRecording: false,
  pendingShortcut: null,    // { electron: 'CommandOrControl+Shift+V', display: '⌘ ⇧ V' }
  originalShortcut: null,
};

// Маппинг клавиш браузера → Electron формат
const KEY_MAP = {
  'Meta': 'Command', 'Control': 'Control', 'Alt': 'Alt', 'Shift': 'Shift',
};

const DISPLAY_MAP = {
  'Meta': '⌘', 'Control': '⌃', 'Alt': '⌥', 'Shift': '⇧',
  'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→',
  'Backspace': '⌫', 'Delete': '⌦', 'Enter': '↩', 'Tab': '⇥',
  'Escape': 'Esc', 'Space': 'Space', 'CapsLock': 'Caps',
  'F1':'F1','F2':'F2','F3':'F3','F4':'F4','F5':'F5','F6':'F6',
  'F7':'F7','F8':'F8','F9':'F9','F10':'F10','F11':'F11','F12':'F12',
};

// Конвертация Electron-строки в красивый вид
function electronShortcutToDisplay(shortcut) {
  return shortcut
    .replace('CommandOrControl', '⌘')
    .replace('Command', '⌘')
    .replace('Control', '⌃')
    .replace('Shift', '⇧')
    .replace('Alt', '⌥')
    .split('+')
    .map(k => k.trim())
    .join(' ');
}

// Рендер бейджей клавиш
function renderKeyBadges(keys) {
  elements.shortcutKeys.innerHTML = keys
    .map(k => `<span class="shortcut-key-badge">${k}</span>`)
    .join('');
}

// Открыть настройки
async function openSettings() {
  elements.settingsModal.classList.remove('hidden');

  // Загружаем текущие настройки
  const settings = await window.clipVault.getSettings();
  const autostart = await window.clipVault.getAutostart();
  elements.themeSelect.value = settings.theme || 'system';

  // Показываем текущий шорткат
  recorderState.originalShortcut = settings.shortcut || 'CommandOrControl+Shift+V';
  recorderState.pendingShortcut = null;
  stopRecording(false);
  displayCurrentShortcut(recorderState.originalShortcut);

  // Автозапуск
  elements.autostartToggle.checked = autostart;

  // Виджет
  elements.widgetToggle.checked = settings.showWidget || false;

  // Лимит истории
  const limit = settings.maxHistory || 500;
  elements.historyLimitSlider.value = limit;
  elements.historyLimitValue.textContent = limit;

  // Прячем кнопки сохранения
  elements.btnSaveShortcut.classList.add('hidden');
  elements.btnCancelShortcut.classList.add('hidden');
}

function closeSettings() {
  stopRecording(false);
  elements.settingsModal.classList.add('hidden');
}

function displayCurrentShortcut(electronShortcut) {
  const display = electronShortcutToDisplay(electronShortcut);
  renderKeyBadges(display.split(' ').filter(Boolean));
  elements.shortcutStatus.textContent = 'Нажмите чтобы изменить';
  elements.shortcutStatus.className = 'shortcut-status';
  elements.shortcutDisplay.className = 'shortcut-display';
}

// Начать запись
function startRecording() {
  recorderState.isRecording = true;
  elements.shortcutDisplay.classList.add('recording');
  elements.shortcutStatus.textContent = 'Нажмите сочетание клавиш...';
  elements.shortcutStatus.className = 'shortcut-status recording-active';
  renderKeyBadges(['?']);
}

// Остановить запись
function stopRecording(keepPending = true) {
  recorderState.isRecording = false;
  elements.shortcutDisplay.classList.remove('recording', 'error');

  if (!keepPending || !recorderState.pendingShortcut) {
    displayCurrentShortcut(recorderState.originalShortcut);
    elements.btnSaveShortcut.classList.add('hidden');
    elements.btnCancelShortcut.classList.add('hidden');
  } else {
    // Показываем pending шорткат
    renderKeyBadges(recorderState.pendingShortcut.display.split(' ').filter(Boolean));
    elements.shortcutStatus.textContent = '✓ Готово к сохранению';
    elements.shortcutStatus.className = 'shortcut-status recording-active';
  }
}

// Обработка нажатия клавиш во время записи
function handleRecorderKeydown(e) {
  if (!recorderState.isRecording) return;
  e.preventDefault();
  e.stopPropagation();

  const { key, metaKey, ctrlKey, altKey, shiftKey } = e;

  // Игнорируем одиночные модификаторы
  if (['Meta','Control','Alt','Shift','CapsLock'].includes(key)) return;

  // Нужен хотя бы один модификатор
  if (!metaKey && !ctrlKey && !altKey) {
    elements.shortcutDisplay.classList.add('error');
    elements.shortcutStatus.textContent = 'Нужен хотя бы Cmd, Ctrl или Alt';
    elements.shortcutStatus.className = 'shortcut-status error-state';
    setTimeout(() => {
      if (recorderState.isRecording) {
        elements.shortcutDisplay.classList.remove('error');
        elements.shortcutStatus.textContent = 'Нажмите сочетание клавиш...';
        elements.shortcutStatus.className = 'shortcut-status recording-active';
        renderKeyBadges(['?']);
      }
    }, 1500);
    return;
  }

  // Формируем Electron-строку
  const parts = [];
  const displayParts = [];

  if (metaKey || ctrlKey) {
    parts.push('CommandOrControl');
    displayParts.push('⌘');
  }
  if (altKey) {
    parts.push('Alt');
    displayParts.push('⌥');
  }
  if (shiftKey) {
    parts.push('Shift');
    displayParts.push('⇧');
  }

  // Основная клавиша
  const mainKey = DISPLAY_MAP[key] || key.toUpperCase();
  parts.push(key === ' ' ? 'Space' : (key.length === 1 ? key.toUpperCase() : key));
  displayParts.push(mainKey);

  const electronShortcut = parts.join('+');
  const displayShortcut = displayParts.join(' ');

  recorderState.pendingShortcut = { electron: electronShortcut, display: displayShortcut };

  stopRecording(true);
  elements.btnSaveShortcut.classList.remove('hidden');
  elements.btnCancelShortcut.classList.remove('hidden');
}

// Сохранить шорткат
async function saveShortcut() {
  if (!recorderState.pendingShortcut) return;
  const newShortcut = recorderState.pendingShortcut.electron;

  try {
    await window.clipVault.updateSettings({ shortcut: newShortcut });
    recorderState.originalShortcut = newShortcut;
    recorderState.pendingShortcut = null;

    elements.btnSaveShortcut.classList.add('hidden');
    elements.btnCancelShortcut.classList.add('hidden');
    elements.shortcutStatus.textContent = 'Сохранено!';
    elements.shortcutStatus.className = 'shortcut-status recording-active';

    // Обновляем статус-бар
    const display = electronShortcutToDisplay(newShortcut);
    if (elements.statusShortcut) elements.statusShortcut.textContent = display;

    setTimeout(() => {
      elements.shortcutStatus.textContent = 'Нажмите чтобы изменить';
      elements.shortcutStatus.className = 'shortcut-status';
    }, 2000);

    showToast('Горячая клавиша обновлена!');
  } catch (err) {
    showToast('Ошибка сохранения');
  }
}

// Сбросить к умолчанию
async function resetShortcut() {
  const defaultShortcut = 'CommandOrControl+Shift+V';
  await window.clipVault.updateSettings({ shortcut: defaultShortcut });
  recorderState.originalShortcut = defaultShortcut;
  recorderState.pendingShortcut = null;
  displayCurrentShortcut(defaultShortcut);
  elements.btnSaveShortcut.classList.add('hidden');
  elements.btnCancelShortcut.classList.add('hidden');
  if (elements.statusShortcut) elements.statusShortcut.textContent = '⌘⇧V';
  showToast('Сброшено к ⌘⇧V');
}

// Инициализация настроек
function setupSettingsListeners() {
  elements.themeSelect.addEventListener('change', async (event) => {
    await window.clipVault.updateSettings({ theme: event.target.value });
    state.theme = await window.clipVault.getTheme();
    applyTheme(state.theme);
  });
  // Открыть настройки
  elements.btnSettings.addEventListener('click', openSettings);

  // Закрыть
  elements.settingsClose.addEventListener('click', closeSettings);
  elements.settingsModal.querySelector('.modal-backdrop').addEventListener('click', closeSettings);

  // Рекордер — клик для начала записи
  elements.shortcutDisplay.addEventListener('click', () => {
    if (recorderState.isRecording) {
      stopRecording(false);
    } else {
      startRecording();
    }
  });

  // Захват клавиш
  document.addEventListener('keydown', (e) => {
    if (recorderState.isRecording) {
      handleRecorderKeydown(e);
    }
  }, true); // capture phase - перехватываем раньше других

  // Кнопки шортката
  elements.btnSaveShortcut.addEventListener('click', saveShortcut);
  elements.btnCancelShortcut.addEventListener('click', () => {
    recorderState.pendingShortcut = null;
    stopRecording(false);
  });
  elements.btnResetShortcut.addEventListener('click', resetShortcut);

  // Автозапуск
  elements.autostartToggle.addEventListener('change', async (e) => {
    await window.clipVault.setAutostart(e.target.checked);
    showToast(e.target.checked ? 'Автозапуск включён' : 'Автозапуск выключен');
  });

  // Настольный виджет
  elements.widgetToggle.addEventListener('change', async (e) => {
    await window.clipVault.updateSettings({ showWidget: e.target.checked });
    showToast(e.target.checked ? 'Виджет включён' : 'Виджет выключен');
  });

  // Лимит истории — слайдер
  elements.historyLimitSlider.addEventListener('input', (e) => {
    elements.historyLimitValue.textContent = e.target.value;
  });

  elements.btnSaveLimit.addEventListener('click', async () => {
    const limit = parseInt(elements.historyLimitSlider.value);
    await window.clipVault.updateSettings({ maxHistory: limit });
    showToast(`Лимит обновлён: ${limit}`);
  });
}

// ===== Start Application =====
init().catch(err => {
  console.error('Failed to initialize ClipVault:', err);
});
