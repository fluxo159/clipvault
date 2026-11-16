/**
 * Classifier — автоматическая классификация контента из буфера обмена.
 * Определяет тип: url, color, code, email, text
 */

// Паттерны для определения типов
const PATTERNS = {
  // URL — http/https/ftp ссылки
  url: /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i,

  // URL с www
  urlWww: /^www\.[^\s/$.?#].[^\s]*$/i,

  // HEX цвета: #RGB, #RRGGBB, #RRGGBBAA
  hexColor: /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/,

  // RGB/RGBA: rgb(r, g, b) / rgba(r, g, b, a)
  rgbColor: /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+))?\s*\)$/i,

  // HSL/HSLA: hsl(h, s%, l%) / hsla(h, s%, l%, a)
  hslColor: /^hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*(,\s*(0|1|0?\.\d+))?\s*\)$/i,

  // Email
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,

  // Номер телефона (международный формат)
  phone: /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\./0-9]{7,15}$/,
};

// Ключевые слова для определения кода
const CODE_INDICATORS = [
  // Синтаксис
  /[{}\[\]];?\s*$/m,
  /^\s*(const|let|var|function|class|import|export|return|if|else|for|while|switch|try|catch)\s/m,
  /=>/,
  /\(\s*\)\s*{/,
  // Python
  /^\s*(def|class|import|from|return|if|elif|else|for|while|try|except|with)\s/m,
  // HTML/CSS
  /^<[a-zA-Z][^>]*>/m,
  /^\s*\.[a-zA-Z][\w-]*\s*{/m,
  // JSON
  /^\s*[{[]\s*"[^"]+"\s*:/m,
];

/**
 * Определяет тип контента.
 * @param {string} text - текст из буфера обмена
 * @returns {{ type: string, content: string, metadata: object }}
 */
export function classify(text) {
  if (!text || typeof text !== 'string') {
    return { type: 'text', content: '', metadata: {} };
  }

  const trimmed = text.trim();

  // 1. Проверяем цвет (точное совпадение всего текста)
  if (PATTERNS.hexColor.test(trimmed)) {
    return {
      type: 'color',
      content: trimmed,
      metadata: {
        format: 'hex',
        color: trimmed,
        rgb: hexToRgb(trimmed)
      }
    };
  }

  if (PATTERNS.rgbColor.test(trimmed) && validColorComponents(trimmed, 'rgb')) {
    return {
      type: 'color',
      content: trimmed,
      metadata: {
        format: 'rgb',
        color: trimmed,
        hex: rgbStringToHex(trimmed)
      }
    };
  }

  if (PATTERNS.hslColor.test(trimmed) && validColorComponents(trimmed, 'hsl')) {
    return {
      type: 'color',
      content: trimmed,
      metadata: {
        format: 'hsl',
        color: trimmed,
        hex: hslStringToHex(trimmed)
      }
    };
  }

  // 2. Проверяем URL
  if (PATTERNS.url.test(trimmed) || PATTERNS.urlWww.test(trimmed)) {
    const url = PATTERNS.urlWww.test(trimmed) ? `https://${trimmed}` : trimmed;
    let domain = '';
    try {
      domain = new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
      domain = trimmed;
    }
    return {
      type: 'url',
      content: trimmed,
      metadata: {
        url: url,
        domain: domain,
        favicon: ''
      }
    };
  }

  // 3. Проверяем email
  if (PATTERNS.email.test(trimmed)) {
    return {
      type: 'email',
      content: trimmed,
      metadata: {
        email: trimmed,
        domain: trimmed.split('@')[1]
      }
    };
  }

  // 4. Проверяем телефон
  if (PATTERNS.phone.test(trimmed) && trimmed.replace(/\D/g, '').length >= 7) {
    return {
      type: 'phone',
      content: trimmed,
      metadata: { phone: trimmed }
    };
  }

  // 5. Проверяем код (если текст длиннее 20 символов)
  if (trimmed.length > 20) {
    const codeScore = CODE_INDICATORS.reduce((score, pattern) => {
      return score + (pattern.test(trimmed) ? 1 : 0);
    }, 0);

    if (codeScore >= 2) {
      return {
        type: 'code',
        content: trimmed,
        metadata: {
          lines: trimmed.split('\n').length,
          score: codeScore
        }
      };
    }
  }

  // 6. По умолчанию — текст
  return {
    type: 'text',
    content: trimmed,
    metadata: {
      length: trimmed.length,
      words: trimmed.split(/\s+/).length,
      lines: trimmed.split('\n').length
    }
  };
}

function validColorComponents(value, format) {
  const components = value.slice(value.indexOf('(') + 1, -1).split(',').map(v => v.trim());
  const hasAlpha = value.toLowerCase().startsWith(format + 'a(');
  if (components.length !== (hasAlpha ? 4 : 3)) return false;
  const limits = format === 'rgb' ? [255, 255, 255] : [360, 100, 100];
  return components.every((component, i) => {
    const number = Number(component.replace('%', ''));
    return Number.isFinite(number) && number >= 0 && number <= (i === 3 ? 1 : limits[i]);
  });
}

/**
 * Конвертирует HEX в RGB.
 */
function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) {
    h = h.split('').map(c => c + c).join('');
  }
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return { r, g, b };
}

/**
 * Конвертирует строку rgb(...) в HEX.
 */
function rgbStringToHex(rgbStr) {
  const match = rgbStr.match(/\d+/g);
  if (!match || match.length < 3) return '#000000';
  const [r, g, b] = match.map(Number);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}

/**
 * Конвертирует строку hsl(...) в HEX.
 */
function hslStringToHex(hslStr) {
  const match = hslStr.match(/[\d.]+/g);
  if (!match || match.length < 3) return '#000000';
  let [h, s, l] = match.map(Number);
  s /= 100;
  l /= 100;

  const a_val = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a_val * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color);
  };

  return `#${((1 << 24) + (f(0) << 16) + (f(8) << 8) + f(4)).toString(16).slice(1).toUpperCase()}`;
}

/**
 * Возвращает иконку-эмодзи для типа контента.
 */
export function getTypeIcon(type) {
  const icons = {
    url: '🔗',
    color: '🎨',
    code: '💻',
    email: '📧',
    phone: '📞',
    text: '📝'
  };
  return icons[type] || '📋';
}

/**
 * Возвращает лейбл для типа контента.
 */
export function getTypeLabel(type) {
  const labels = {
    url: 'Ссылка',
    color: 'Цвет',
    code: 'Код',
    email: 'Email',
    phone: 'Телефон',
    text: 'Текст'
  };
  return labels[type] || 'Текст';
}
