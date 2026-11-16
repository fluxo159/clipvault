// Preview fixtures only. This bridge never reads the system clipboard or user data.
const { contextBridge } = require('electron');
const now = Date.now();
const clips = [
  { id: '1', type: 'text', content: 'Хорошие идеи заслуживают места.\nСохраните их, чтобы вернуться позже.', metadata: {words: 10}, timestamp: now - 120000 },
  { id: '2', type: 'url', content: 'https://developer.apple.com/design/', metadata: {domain: 'developer.apple.com', favicon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'}, timestamp: now - 480000 },
  { id: '3', type: 'color', content: '#A8B8CC', metadata: {color: '#A8B8CC'}, pinned: true, timestamp: now - 1800000 },
  { id: '4', type: 'code', content: 'const ideas = clipboard.history;\nreturn ideas.filter(isWorthKeeping);', metadata: {lines: 2}, timestamp: now - 3600000 },
  { id: '5', type: 'text', content: 'Встреча с командой — в четверг, 14:00.\nОбсудить новый интерфейс и детали запуска.', metadata: {words: 14}, timestamp: now - 7200000 },
];
let history = clips;
let changed;
contextBridge.exposeInMainWorld('clipVault', {
  getTheme: async () => 'light', getHistory: async () => history,
  getSettings: async () => ({ shortcut: 'CommandOrControl+Shift+V', maxHistory: 500, showWidget: false }),
  getAutostart: async () => false, setAutostart: async value => value,
  onHistoryChanged: callback => { changed = callback; }, onThemeChanged: () => {}, onWindowShow: () => {},
  copyToClipboard: async () => true, hideWindow: async () => {},
  togglePin: async id => { history = history.map(item => item.id === id ? {...item, pinned: !item.pinned} : item); changed?.(history); return history; },
  deleteItem: async id => { history = history.filter(item => item.id !== id); changed?.(history); return history; },
  clearHistory: async () => { history = history.filter(item => item.pinned); changed?.(history); return history; },
  updateSettings: async settings => settings, exportHistory: async () => ({cancelled: true}),
  dragWidget: async () => {}, saveWidgetPosition: async () => {},
  getStats: async () => ({ totalClips: 1284, todayCount: 32, totalPastes: 216, pinnedCount: 1,
    byType: {text: 760, url: 320, code: 140, color: 64}, maxDayCount: 45,
    last7Days: ['вс','пн','вт','ср','чт','пт','сб'].map((label, i) => ({label, count: [12, 32, 23, 45, 19, 37, 32][i]})),
    topUsed: [{...clips[1], usageCount: 12}, {...clips[3], usageCount: 8}],
  }),
});
