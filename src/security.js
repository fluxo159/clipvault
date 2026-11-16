import path from 'node:path';
import fs from 'node:fs';

export function isTrustedSender(event, allowedURLs, allowedIds) {
  const frame = event.senderFrame;
  return Boolean(frame && frame === event.sender.mainFrame && allowedIds.includes(event.sender.id)
    && allowedURLs.includes(frame.url));
}

export function storedImagePath(candidate, directory) {
  if (typeof candidate !== 'string' || !directory) throw new Error('Invalid image');
  const resolved = path.resolve(candidate);
  if (path.dirname(resolved) !== path.resolve(directory) || !/^clip_[a-zA-Z0-9_]+\.png$/.test(path.basename(resolved)))
    throw new Error('Image outside the history directory');
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(resolved) !== path.join(fs.realpathSync(directory), path.basename(resolved)))
    throw new Error('Invalid image file');
  return resolved;
}

export function sanitizeSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid settings');
  const result = {};
  for (const [key, val] of Object.entries(value)) {
    if (key === 'maxHistory' && Number.isInteger(val) && val >= 1 && val <= 10000) result[key] = val;
    else if (key === 'pollInterval' && Number.isInteger(val) && val >= 250 && val <= 60000) result[key] = val;
    else if (key === 'theme' && ['system', 'light', 'dark'].includes(val)) result[key] = val;
    else if (['showWidget', 'openAtLogin'].includes(key) && typeof val === 'boolean') result[key] = val;
    else if (key === 'shortcut' && typeof val === 'string' && val.length > 0 && val.length <= 100 && /^[a-zA-Z0-9+ -]+$/.test(val)) result[key] = val;
    else throw new Error('Unsupported setting');
  }
  return result;
}

export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
