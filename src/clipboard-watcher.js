import { EventEmitter } from 'events';
import { clipboard } from 'electron';
import { createHash } from 'node:crypto';

const THUMB_MAX_SIZE = 320; // px — максимальный размер превью

/**
 * ClipboardWatcher — мониторит буфер через polling.
 * Оптимизировано: изображения сжимаются до thumbnail перед отправкой.
 */
export class ClipboardWatcher extends EventEmitter {
  constructor(interval = 500) {
    super();
    this.interval = interval;
    this.timer = null;
    this.previousText = '';
    this.previousImageHash = '';
  }

  start() {
    if (this.timer) return this;
    this.previousText = clipboard.readText() || '';
    this.previousImageHash = this._getImageHash();
    this.timer = setInterval(() => this._check(), this.interval);
    return this;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    return this;
  }

  /** Хэш содержимого различает изображения одинакового размера. */
  _getImageHash(image = clipboard.readImage()) {
    if (!image || image.isEmpty()) return '';
    const { width, height } = image.getSize();
    return createHash('sha256').update(`${width}x${height}:`).update(image.toBitmap()).digest('hex');
  }

  _check() {
    try {
      const img = clipboard.readImage();
      const hasImage = !img.isEmpty();
      const currentText = clipboard.readText() || '';

      // ── Изображение ──────────────────────────────────────
      if (hasImage) {
        const imageHash = this._getImageHash(img);
        if (imageHash && imageHash !== this.previousImageHash) {
          this.previousImageHash = imageHash;
          this.previousText = currentText;

          if (!img.isEmpty()) {
            const originalSize = img.getSize();
            // Полный буфер PNG для реального копирования
            const pngBuffer = img.toPNG();

            // Сжимаем thumbnail для отображения (max 320px)
            const thumb = this._createThumbnail(img, originalSize);

            this.emit('change', {
              type: 'image',
              imageHash,
              text: `[Изображение ${originalSize.width}×${originalSize.height}]`,
              imageBuffer: pngBuffer,           // полный PNG для сохранения на диск
              thumbDataURL: thumb.toDataURL(),  // маленький для UI
              imageSize: originalSize,
              imageSizeBytes: pngBuffer.length,
              timestamp: Date.now()
            });
          }
        }
        return;
      }

      this.previousImageHash = '';

      // ── Текст ────────────────────────────────────────────
      if (currentText && currentText !== this.previousText) {
        this.previousText = currentText;
        this.previousImageHash = '';
        const html = clipboard.readHTML() || '';
        this.emit('change', {
          type: 'text',
          text: currentText,
          html,
          timestamp: Date.now()
        });
      } else if (!currentText) {
        this.previousText = '';
      }
    } catch (err) {
      console.error('[ClipboardWatcher] Error:', err.message);
    }
  }

  /** Создаёт thumbnail не больше THUMB_MAX_SIZE px по большей стороне */
  _createThumbnail(img, size) {
    const { width, height } = size;
    if (width <= THUMB_MAX_SIZE && height <= THUMB_MAX_SIZE) return img;

    const ratio = Math.min(THUMB_MAX_SIZE / width, THUMB_MAX_SIZE / height);
    return img.resize({
      width: Math.max(1, Math.round(width * ratio)),
      height: Math.max(1, Math.round(height * ratio)),
      quality: 'good'
    });
  }
}
