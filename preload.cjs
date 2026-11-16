/**
 * preload.js — Context Bridge для безопасного взаимодействия
 * между Main Process и Renderer.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clipVault', {
  // ===== История =====
  
  /** Получить всю историю */
  getHistory: () => ipcRenderer.invoke('get-history'),
  
  /** Удалить элемент из истории */
  deleteItem: (id) => ipcRenderer.invoke('delete-item', id),
  
  /** Очистить всю историю */
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  
  // ===== Pinning =====
  
  /** Закрепить/открепить элемент */
  togglePin: (id) => ipcRenderer.invoke('toggle-pin', id),
  
  // ===== Clipboard =====
  
  /** Скопировать текст в буфер обмена */
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  
  // ===== Поиск =====
  
  /** Поиск по истории */
  search: (query) => ipcRenderer.invoke('search-history', query),
  
  // ===== Статистика =====
  
  /** Получить статистику */
  getStats: () => ipcRenderer.invoke('get-stats'),
  
  // ===== Экспорт =====
  
  /** Экспорт истории в файл */
  exportHistory: (format) => ipcRenderer.invoke('export-history', format),
  
  // ===== Тема =====
  
  /** Получить текущую тему (dark/light) */
  getTheme: () => ipcRenderer.invoke('get-theme'),
  
  // ===== Настройки =====
  
  /** Получить настройки */
  getSettings: () => ipcRenderer.invoke('get-settings'),
  
  /** Обновить настройки */
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
  
  onHistoryChanged: (callback) => {
    ipcRenderer.on('history-changed', (_event, history) => callback(history));
  },

  // ===== События =====
  
  /** Подписка на добавление нового элемента */
  onClipAdded: (callback) => {
    ipcRenderer.on('clip-added', (_event, item) => callback(item));
  },
  
  /** Подписка на смену темы */
  onThemeChanged: (callback) => {
    ipcRenderer.on('theme-changed', (_event, theme) => callback(theme));
  },
  
  /** Подписка на показ/скрытие окна */
  onWindowShow: (callback) => {
    ipcRenderer.on('window-show', () => callback());
  },

  /** Скрыть окно */
  hideWindow: () => ipcRenderer.invoke('hide-window'),

  /** Получить статус автозапуска */
  getAutostart: () => ipcRenderer.invoke('get-autostart'),

  /** Включить/выключить автозапуск */
  setAutostart: (enable) => ipcRenderer.invoke('set-autostart', enable),

  // ===== Widget dragging =====
  dragWidget: (dx, dy) => ipcRenderer.invoke('drag-widget', { dx, dy }),
  saveWidgetPosition: () => ipcRenderer.invoke('save-widget-position'),
});

