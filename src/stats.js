/**
 * Stats — модуль статистики использования буфера обмена.
 */

/**
 * Обновляет статистику при добавлении нового элемента.
 * @param {object} store - electron-store instance
 * @param {object} item - элемент буфера обмена { type, timestamp, ... }
 */
export function recordClip(store, item) {
  const stats = store.get('stats', getDefaultStats());
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Общий счётчик
  stats.totalClips++;

  // Счётчик по типам
  stats.byType[item.type] = (stats.byType[item.type] || 0) + 1;

  // Счётчик по дням
  if (!stats.byDay[today]) {
    stats.byDay[today] = 0;
  }
  stats.byDay[today]++;

  // Счётчик по часам (для текущего дня)
  const hour = new Date().getHours();
  if (!stats.byHour) stats.byHour = {};
  stats.byHour[hour] = (stats.byHour[hour] || 0) + 1;

  // Обновляем дату последней активности
  stats.lastActivity = Date.now();

  // Очищаем старые дни (больше 30 дней)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  for (const day of Object.keys(stats.byDay)) {
    if (day < cutoffStr) {
      delete stats.byDay[day];
    }
  }

  store.set('stats', stats);
}

/**
 * Записывает факт использования (копирования из истории).
 * @param {object} store - electron-store instance
 * @param {string} itemId - ID элемента
 */
export function recordUsage(store, itemId) {
  const stats = store.get('stats', getDefaultStats());
  stats.totalPastes = (stats.totalPastes || 0) + 1;

  // Частота использования элементов
  if (!stats.usageCount) stats.usageCount = {};
  stats.usageCount[itemId] = (stats.usageCount[itemId] || 0) + 1;

  store.set('stats', stats);
}

/**
 * Получает полную статистику.
 * @param {object} store - electron-store instance
 * @returns {object} статистика
 */
export function getStats(store) {
  const stats = store.get('stats', getDefaultStats());
  const history = store.get('history', []);

  // Считаем сегодняшние клипы
  const today = new Date().toISOString().split('T')[0];
  const todayCount = stats.byDay[today] || 0;

  // Данные за последние 7 дней для графика
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().split('T')[0];
    const dayLabel = d.toLocaleDateString('ru-RU', { weekday: 'short' });
    last7Days.push({
      date: dayStr,
      label: dayLabel,
      count: stats.byDay[dayStr] || 0
    });
  }

  // Максимальное значение за 7 дней для нормализации
  const maxDayCount = Math.max(...last7Days.map(d => d.count), 1);

  // Топ-5 самых используемых элементов
  const topUsed = [];
  if (stats.usageCount) {
    const sorted = Object.entries(stats.usageCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [id, count] of sorted) {
      const item = history.find(h => h.id === id);
      if (item) {
        topUsed.push({ ...item, usageCount: count });
      }
    }
  }

  return {
    totalClips: stats.totalClips,
    totalPastes: stats.totalPastes || 0,
    todayCount,
    pinnedCount: history.filter(h => h.pinned).length,
    historyCount: history.length,
    byType: stats.byType,
    last7Days,
    maxDayCount,
    topUsed,
    byHour: stats.byHour || {}
  };
}

/**
 * Возвращает статистику по умолчанию.
 */
function getDefaultStats() {
  return {
    totalClips: 0,
    totalPastes: 0,
    byType: {},
    byDay: {},
    byHour: {},
    usageCount: {},
    lastActivity: Date.now()
  };
}

/**
 * Сбрасывает статистику.
 * @param {object} store - electron-store instance
 */
export function resetStats(store) {
  store.set('stats', getDefaultStats());
}
