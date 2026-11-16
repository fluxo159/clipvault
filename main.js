/**
 * main.js — Главный процесс ClipVault
 * Menubar-приложение для macOS: tray, clipboard watcher, IPC, globalShortcut
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { isTrustedSender, storedImagePath, sanitizeSettings, csvCell } from './src/security.js';
import { app, globalShortcut, ipcMain, clipboard, nativeTheme, dialog, Menu, nativeImage, BrowserWindow } from 'electron';
import { menubar } from 'menubar';
import Store from 'electron-store';
import { ClipboardWatcher } from './src/clipboard-watcher.js';
import { classify } from './src/classifier.js';
import { recordClip, recordUsage, getStats, resetStats } from './src/stats.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== Папка для хранения изображений =====
let imagesDir = '';
function ensureImagesDir() {
  if (!imagesDir) {
    imagesDir = path.join(app.getPath('userData'), 'images');
  }
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
  return imagesDir;
}

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', event => event.preventDefault());
  contents.on('will-frame-navigate', event => event.preventDefault());
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  contents.session.setPermissionCheckHandler(() => false);
});

// ===== Хранилище =====
const store = new Store({
  name: 'clipvault-data',
  defaults: {
    history: [],
    stats: {
      totalClips: 0,
      totalPastes: 0,
      byType: {},
      byDay: {},
      byHour: {},
      usageCount: {},
      lastActivity: Date.now()
    },
    settings: {
      maxHistory: 500,
      shortcut: 'CommandOrControl+Shift+V',
      pollInterval: 500,
      theme: 'system', // 'dark', 'light', 'system'
      showWidget: false,
      widgetPosition: { x: 20, y: 100 }
    }
  }
});

// ===== Menubar App =====
const mb = menubar({
  index: `file://${path.join(__dirname, 'src', 'index.html')}`,
  icon: path.join(__dirname, 'assets', 'IconTemplate.png'),
  preloadWindow: true,
  showDockIcon: false,
  showOnAllWorkspaces: false,
  tooltip: 'ClipVault — Менеджер буфера обмена',
  browserWindow: {
    width: 420,
    height: 540,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    roundedCorners: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  }
});

let watcher = null;
let widgetWin = null;

// ===== Настольный виджет =====
function createWidgetWindow() {
  if (widgetWin) return;

  const settings = store.get('settings');
  const pos = settings.widgetPosition || { x: 20, y: 100 };

  widgetWin = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: 280,
    height: 380,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    focusable: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  widgetWin.loadURL(`file://${path.join(__dirname, 'src', 'widget.html')}`);

  // Отображаем на всех рабочих столах
  widgetWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });

  widgetWin.on('closed', () => {
    widgetWin = null;
  });
}

function destroyWidgetWindow() {
  if (widgetWin) {
    widgetWin.close();
    widgetWin = null;
  }
}


// ===== Автозапуск =====
function getLoginItemStatus() {
  return app.getLoginItemSettings().openAtLogin;
}

function setLoginItem(enable) {
  app.setLoginItemSettings({
    openAtLogin: enable,
    openAsHidden: true, // запускать без показа окна
  });
  store.set('settings.openAtLogin', enable);
  console.log(`🔄 Автозапуск: ${enable ? 'включён' : 'выключен'}`);
}

// ===== App Ready =====
mb.on('ready', () => {
  console.log('✅ ClipVault готов!');

  // Скрываем из Dock
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  // Включаем автозапуск при первом запуске
  const isFirstLaunch = store.get('settings.openAtLogin', null) === null;
  if (isFirstLaunch) {
    setLoginItem(true);
    console.log('🚀 Первый запуск — автозапуск включён автоматически');
  }

  // Запускаем мониторинг буфера
  const settings = store.get('settings');
  watcher = new ClipboardWatcher(settings.pollInterval);

  watcher.on('change', (data) => {
    handleNewClip(data);
  });

  watcher.start();

  // Запускаем виджет при старте, если он включён
  if (settings.showWidget) {
    createWidgetWindow();
  }

  // Регистрируем глобальный шорткат
  registerShortcut(settings.shortcut);

  // Следим за сменой темы
  nativeTheme.on('updated', () => {
    const currentTheme = getCurrentTheme();
    if (mb.window) {
      mb.window.webContents.send('theme-changed', currentTheme);
    }
    if (widgetWin) {
      widgetWin.webContents.send('theme-changed', currentTheme);
    }
  });
});

// Настраиваем окно ОДИН РАЗ после создания
mb.on('after-create-window', () => {
  // Скрываем при потере фокуса (blur вешаем один раз)
  mb.window.on('blur', () => {
    mb.hideWindow();
  });

  // Правый клик по tray-иконке — динамическое меню с актуальным статусом
  mb.tray.on('right-click', () => {
    const isAutostart = getLoginItemStatus();
    const contextMenu = Menu.buildFromTemplate([
      { label: 'ClipVault', enabled: false },
      { type: 'separator' },
      { label: '📋 Открыть', click: () => mb.showWindow() },
      { type: 'separator' },
      {
        label: isAutostart ? '✅ Запускать при входе' : '⬜ Запускать при входе',
        type: 'checkbox',
        checked: isAutostart,
        click: () => setLoginItem(!isAutostart)
      },
      { type: 'separator' },
      { label: '🚪 Выйти', click: () => app.exit(0) }
    ]);
    mb.tray.popUpContextMenu(contextMenu);
  });
});

mb.on('after-show', () => {
  if (mb.window) {
    mb.window.webContents.send('window-show');
  }
});

// Очистка при выходе
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (watcher) watcher.stop();
  destroyWidgetWindow();
});

// Не завершаем приложение при закрытии всех окон
app.on('window-all-closed', (e) => {
  e.preventDefault();
});

// ===== Обработка нового элемента =====
function handleNewClip(data) {
  const previous = store.get('history', [])[0];
  if (previous && (data.type === 'image'
    ? previous.type === 'image' && previous.imageHash === data.imageHash
    : previous.type !== 'image' && previous.content === data.text)) return;

  let item;

  if (data.type === 'image') {
    // ── Изображение: сохраняем PNG на диск, в JSON путь + маленький thumb
    const id = generateId();
    let imagePath = null;

    try {
      const dir = ensureImagesDir();
      imagePath = path.join(dir, `${id}.png`);
      fs.writeFileSync(imagePath, data.imageBuffer);
    } catch (err) {
      console.error('[Image] Ошибка сохранения изображения:', err.message);
    }

    item = {
      id,
      type: 'image',
      content: data.text,
      imageHash: data.imageHash,
      imagePath,                    // путь к PNG-файлу на диске
      thumbDataURL: data.thumbDataURL, // маленький base64 для UI
      imageSize: data.imageSize,
      metadata: {
        width: data.imageSize?.width,
        height: data.imageSize?.height,
        sizeKB: Math.round((data.imageSizeBytes || 0) / 1024)
      },
      html: '',
      pinned: false,
      timestamp: data.timestamp,
      createdAt: new Date(data.timestamp).toISOString()
    };
  } else {
    // ── Текст ────────────────────────────────────────────
    const classified = classify(data.text);
    item = {
      id: generateId(),
      type: classified.type,
      content: data.text,
      html: data.html,
      metadata: classified.metadata,
      pinned: false,
      timestamp: data.timestamp,
      createdAt: new Date(data.timestamp).toISOString()
    };
  }

  // Получаем текущую историю
  let history = store.get('history', []);
  
  // Добавляем в начало
  history.unshift(item);

  // Ограничиваем историю (но не удаляем закреплённые)
  const settings = store.get('settings');
  const unpinned = history.filter(h => !h.pinned);
  
  if (unpinned.length > settings.maxHistory) {
    unpinned.slice(settings.maxHistory).forEach(removeImageFile);
    const retained = new Set(unpinned.slice(0, settings.maxHistory).map(h => h.id));
    history = history.filter(h => h.pinned || retained.has(h.id));
  }

  store.set('history', history);

  // Записываем статистику
  recordClip(store, item);

  broadcastHistory();
}

function removeImageFile(item) {
  if (!item?.imagePath) return;
  try {
    fs.unlinkSync(storedImagePath(item.imagePath, ensureImagesDir()));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[Image] Ошибка удаления:', err.message);
  }
}

function broadcastHistory() {
  const history = store.get('history', []);
  for (const win of [mb.window, widgetWin]) {
    if (win && !win.isDestroyed()) win.webContents.send('history-changed', history);
  }
}

// ===== Регистрация горячей клавиши =====
function registerShortcut(shortcut) {
  globalShortcut.unregisterAll();
  
  try {
    const success = globalShortcut.register(shortcut, () => {
      if (mb.window && mb.window.isVisible()) {
        mb.hideWindow();
      } else {
        mb.showWindow();
      }
    });

    if (!success) {
      console.error('❌ Не удалось зарегистрировать горячую клавишу:', shortcut);
    } else {
      console.log('⌨️  Горячая клавиша зарегистрирована:', shortcut);
    }
  } catch (err) {
    console.error('❌ Ошибка регистрации горячей клавиши:', err);
  }
}

// ===== Получение текущей темы =====
function getCurrentTheme() {
  const setting = store.get('settings.theme', 'system');
  if (setting === 'system') {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  }
  return setting;
}

// ===== Генерация уникального ID =====
function generateId() {
  return `clip_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Only the two local top-level application windows may call privileged IPC.
function handle(channel, callback) {
  ipcMain.handle(channel, (event, ...args) => {
    const windows = [mb.window, widgetWin].filter(win => win && !win.isDestroyed());
    const urls = ['index.html', 'widget.html'].map(name => pathToFileURL(path.join(__dirname, 'src', name)).href);
    if (!isTrustedSender(event, urls, windows.map(win => win.webContents.id))) throw new Error('Untrusted IPC sender');
    return callback(event, ...args);
  });
}

// ===== IPC Handlers =====

// Получить историю
handle('get-history', () => {
  return store.get('history', []);
});

// Удалить элемент
handle('delete-item', (_event, id) => {
  let history = store.get('history', []);
  const item = history.find(h => h.id === id);

  removeImageFile(item);

  history = history.filter(h => h.id !== id);
  store.set('history', history);
  broadcastHistory();
  return history;
});

// Очистить историю (кроме закреплённых)
handle('clear-history', () => {
  const history = store.get('history', []);

  history.filter(h => !h.pinned).forEach(removeImageFile);

  const kept = history.filter(h => h.pinned);
  store.set('history', kept);
  resetStats(store);
  broadcastHistory();
  return kept;
});

// Закрепить/открепить
handle('toggle-pin', (_event, id) => {
  let history = store.get('history', []);
  const item = history.find(h => h.id === id);
  if (item) {
    item.pinned = !item.pinned;
    store.set('history', history);
    broadcastHistory();
  }
  return history;
});

// Скопировать в буфер обмена
handle('copy-to-clipboard', (_event, payload) => {
  const isImage = typeof payload === 'object' && payload?.imagePath;
  const saved = isImage && store.get('history', []).find(item => item.type === 'image' && item.imagePath === payload.imagePath);
  if (isImage && !saved) throw new Error('Unknown history image');
  const text = typeof payload === 'string' ? payload : payload?.text || '';

  if (watcher) watcher.stop();

  if (isImage) {
    try {
      // Читаем полный PNG с диска — без потерь качества
      const imgBuffer = fs.readFileSync(storedImagePath(saved.imagePath, ensureImagesDir()));
      const img = nativeImage.createFromBuffer(imgBuffer);
      clipboard.writeImage(img);
    } catch (err) {
      console.error('Error reading image from disk:', err.message);
      // Фоллбэк: копируем текст
      clipboard.writeText(text);
    }
  } else {
    clipboard.writeText(text);
  }

  setTimeout(() => {
    if (watcher) {
      watcher.previousText = isImage ? '' : text;
      watcher.previousImageHash = isImage ? watcher._getImageHash() : '';
      watcher.start();
    }
  }, 600);

  const history = store.get('history', []);
  const item = history.find(h => isImage
    ? h.imagePath === payload.imagePath
    : h.content === text
  );
  if (item) recordUsage(store, item.id);

  return true;
});

// Поиск по истории
handle('search-history', (_event, query) => {
  const history = store.get('history', []);
  
  if (!query || query.trim() === '') {
    return history;
  }
  
  const q = query.toLowerCase().trim();
  return history.filter(item => {
    return item.content.toLowerCase().includes(q) ||
           (item.metadata?.domain && item.metadata.domain.toLowerCase().includes(q)) ||
           (item.type && item.type.toLowerCase().includes(q));
  });
});

// Статистика
handle('get-stats', () => {
  return getStats(store);
});

// Экспорт истории
handle('export-history', async (_event, format) => {
  const history = store.get('history', []);
  
  let content = '';
  let ext = '';
  
  switch (format) {
    case 'json':
      content = JSON.stringify(history, null, 2);
      ext = 'json';
      break;
    case 'csv':
      content = 'ID,Type,Content,Pinned,Timestamp\n';
      content += history.map(h => 
        [h.id, h.type, h.content, h.pinned, h.createdAt].map(csvCell).join(',')
      ).join('\n');
      ext = 'csv';
      break;
    case 'txt':
    default:
      content = history.map((h, i) => 
        `[${i + 1}] ${h.type.toUpperCase()} | ${h.createdAt}\n${h.content}\n${'─'.repeat(50)}`
      ).join('\n\n');
      ext = 'txt';
      break;
  }
  
  try {
    const { filePath } = await dialog.showSaveDialog(mb.window, {
      title: 'Экспорт истории ClipVault',
      defaultPath: `clipvault-export-${new Date().toISOString().split('T')[0]}.${ext}`,
      filters: [
        { name: format.toUpperCase(), extensions: [ext] }
      ]
    });
    
    if (filePath) {
      const fs = await import('fs');
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true, path: filePath };
    }
    return { success: false, cancelled: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Тема
handle('get-theme', () => {
  return getCurrentTheme();
});

// Настройки
handle('get-settings', () => {
  return store.get('settings');
});

handle('update-settings', (_event, newSettings) => {
  const current = store.get('settings');
  newSettings = sanitizeSettings(newSettings);
  const updated = { ...current, ...newSettings };
  store.set('settings', updated);
  
  if (updated.maxHistory !== current.maxHistory) {
    const history = store.get('history', []);
    let count = 0;
    const kept = history.filter(item => item.pinned || ++count <= updated.maxHistory);
    const ids = new Set(kept.map(item => item.id));
    history.filter(item => !ids.has(item.id)).forEach(removeImageFile);
    store.set('history', kept);
    broadcastHistory();
  }

  if (updated.theme !== current.theme) {
    for (const win of [mb.window, widgetWin]) {
      if (win && !win.isDestroyed()) win.webContents.send('theme-changed', getCurrentTheme());
    }
  }

  // Перерегистрируем шорткат если изменился
  if (newSettings.shortcut && newSettings.shortcut !== current.shortcut) {
    registerShortcut(updated.shortcut);
  }
  
  // Обновляем интервал мониторинга если изменился
  if (newSettings.pollInterval && newSettings.pollInterval !== current.pollInterval) {
    if (watcher) {
      watcher.stop();
      watcher.interval = updated.pollInterval;
      watcher.start();
    }
  }

  // Переключаем виджет, если изменилось состояние
  if (newSettings.showWidget !== undefined && newSettings.showWidget !== current.showWidget) {
    if (newSettings.showWidget) {
      createWidgetWindow();
    } else {
      destroyWidgetWindow();
    }
  }
  
  return updated;
});

// Скрыть окно
handle('hide-window', () => {
  mb.hideWindow();
});

// ===== Автозапуск IPC =====

// Получить статус автозапуска
handle('get-autostart', () => {
  return getLoginItemStatus();
});

// Включить/выключить автозапуск
handle('set-autostart', (_event, enable) => {
  if (typeof enable !== 'boolean') throw new Error('Invalid autostart flag');
  setLoginItem(enable);
  return getLoginItemStatus();
});

// Перетаскивание виджета
handle('drag-widget', (_event, { dx, dy }) => {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 2000 || Math.abs(dy) > 2000) throw new Error('Invalid position');
  if (widgetWin) {
    const [x, y] = widgetWin.getPosition();
    widgetWin.setPosition(Math.round(x + dx), Math.round(y + dy));
  }
});

handle('save-widget-position', () => {
  if (widgetWin) {
    const [x, y] = widgetWin.getPosition();
    store.set('settings.widgetPosition', { x, y });
  }
});

