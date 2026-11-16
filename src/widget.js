/**
 * widget.js — Логика настольного виджета ClipVault
 * Рендеринг последних 5 клипов, drag-n-drop окна, клик для копирования
 */

const widgetList = document.getElementById('widget-list');
const widgetHeader = document.getElementById('widget-header');

let clips = [];

const TYPE_ICONS = window.ClipIcons;

// ===== Инициализация =====
async function init() {
  document.querySelectorAll('[data-icon]').forEach(el => {
    el.innerHTML = TYPE_ICONS[el.dataset.icon] || TYPE_ICONS.text;
  });
  // Настройка темы
  const theme = await window.clipVault.getTheme();
  applyTheme(theme);

  // Получаем историю
  const history = await window.clipVault.getHistory();
  clips = history.slice(0, 5);
  renderClips();

  // Подписка на добавление новых элементов
  window.clipVault.onHistoryChanged((history) => {
    clips = history.slice(0, 5);
    renderClips();
  });

  // Подписка на тему
  window.clipVault.onThemeChanged((theme) => {
    applyTheme(theme);
  });

  // Настройка перетаскивания окна
  setupDragging();
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

// ===== Рендер списка =====
function renderClips() {
  if (clips.length === 0) {
    widgetList.innerHTML = `
      <div class="widget-empty">
        <div class="widget-empty-icon">${TYPE_ICONS.clipboard}</div>
        <div>История пуста</div>
      </div>
    `;
    return;
  }

  widgetList.innerHTML = '';
  clips.forEach(item => {
    const el = createWidgetElement(item);
    widgetList.appendChild(el);
  });
}

// ===== Создание элемента =====
function createWidgetElement(item) {
  const el = document.createElement('div');
  el.className = 'widget-item';
  el.dataset.id = item.id;

  // Icon
  const iconEl = document.createElement('div');
  iconEl.className = 'widget-item-icon';
  iconEl.innerHTML = TYPE_ICONS[item.type] || TYPE_ICONS.text;
  el.appendChild(iconEl);

  // Content Preview
  if (item.type === 'color') {
    const swatch = document.createElement('div');
    swatch.className = 'widget-item-color';
    swatch.style.backgroundColor = item.content;
    el.appendChild(swatch);

    const textEl = document.createElement('div');
    textEl.className = 'widget-item-text';
    textEl.textContent = item.content;
    el.appendChild(textEl);
  } else if (item.type === 'image') {
    const img = document.createElement('img');
    img.className = 'widget-item-img';
    img.src = item.thumbDataURL || item.imageDataURL || '';
    img.alt = '';
    el.appendChild(img);

    const textEl = document.createElement('div');
    textEl.className = 'widget-item-text';
    textEl.textContent = 'Изображение';
    el.appendChild(textEl);
  } else {
    const textEl = document.createElement('div');
    textEl.className = 'widget-item-text';
    textEl.textContent = item.content.trim();
    el.appendChild(textEl);
  }

  // Click to copy
  el.addEventListener('click', async () => {
    try {
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

      // Визуальный фидбек
      el.style.borderColor = 'var(--accent-primary)';
      el.style.background = 'var(--accent-primary-glow)';
      
      const originalIcon = iconEl.innerHTML;
      iconEl.innerHTML = TYPE_ICONS.check;

      setTimeout(() => {
        el.style.borderColor = 'transparent';
        el.style.background = 'var(--bg-surface)';
        iconEl.innerHTML = originalIcon;
      }, 500);

    } catch (err) {
      console.error('Widget copy failed:', err);
    }
  });

  return el;
}

// ===== Перетаскивание виджета по экрану =====
function setupDragging() {
  let isDragging = false;
  let startX = 0;
  let startY = 0;

  // Слушаем mousedown на хедере
  widgetHeader.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.screenX;
    startY = e.screenY;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const dx = e.screenX - startX;
    const dy = e.screenY - startY;

    startX = e.screenX;
    startY = e.screenY;

    window.clipVault.dragWidget(dx, dy);
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      window.clipVault.saveWidgetPosition();
    }
  });
}

init().catch(err => {
  console.error('Failed to initialize ClipVault widget:', err);
});
