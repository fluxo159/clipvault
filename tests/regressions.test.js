import { pathToFileURL } from 'node:url';
import { isTrustedSender, storedImagePath, sanitizeSettings, csvCell } from '../src/security.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { classify } from '../src/classifier.js';

const root = new URL('../', import.meta.url);
const source = file => fs.readFileSync(new URL(file, root), 'utf8');

test('colors: shorthand alpha, valid boundaries and invalid components', () => {
  assert.deepEqual(classify('#abcd').metadata.rgb, { r: 170, g: 187, b: 204 });
  assert.deepEqual(classify('#aabbccdd').metadata.rgb, { r: 170, g: 187, b: 204 });
  for (const color of ['rgb(999, 0, 0)', 'hsl(10, 101%, 20%)', 'rgb(1, 2, 3, 0.5)', 'rgba(1, 2, 3)']) {
    assert.notEqual(classify(color).type, 'color', color);
  }
  for (const color of ['rgb(255, 0, 0)', 'rgba(1, 2, 3, 0.5)', 'hsl(360, 100%, 50%)']) {
    assert.equal(classify(color).type, 'color', color);
  }
});

test('watcher detects equal-size images and transitions without duplicate timers', () => {
  let currentImage = null;
  let text = '';
  let timers = 0;
  const image = value => ({
    isEmpty: () => false, toBitmap: () => Buffer.from(value),
    getSize: () => ({ width: 10, height: 10 }),
    toPNG: () => Buffer.from(value), toDataURL: () => `data:${value}`,
  });
  const context = vm.createContext({
    EventEmitter, createHash, console,
    clipboard: { readText: () => text, readHTML: () => '', readImage: () => currentImage || { isEmpty: () => true } },
    setInterval: () => ++timers, clearInterval: () => {},
  });
  vm.runInContext(source('src/clipboard-watcher.js').replace(/^import .*;\n/gm, '').replace('export class', 'class') + '\nglobalThis.Watcher = ClipboardWatcher;', context);
  const watcher = new context.Watcher();
  const events = [];
  watcher.on('change', event => events.push(event));
  watcher.start();
  watcher.start();
  assert.equal(timers, 1);
  currentImage = image('A');
  text = 'image alternate text';
  watcher._check();
  watcher._check();
  assert.equal(events.length, 1);
  currentImage = image('B');
  watcher._check();
  assert.equal(events.length, 2);
  assert.notEqual(events[0].imageHash, events[1].imageHash);
  currentImage = null;
  text = '';
  watcher._check();
  currentImage = image('B');
  watcher._check();
  assert.equal(events.length, 3);
  currentImage = null;
  text = 'hello';
  watcher._check();
  text = '';
  watcher._check();
  text = 'hello';
  watcher._check();
  assert.equal(events.filter(event => event.type === 'text').length, 2);
  watcher.stop();
});

test('history preserves order and pins, removes PNGs, broadcasts mutations', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'clipvault-test-'));
  try {
    const handlers = new Map();
    const messages = [];
    let store;
    class MockStore {
      constructor({ defaults }) { this.data = structuredClone(defaults); store = this; }
      get(key, fallback) { return key.split('.').reduce((obj, part) => obj?.[part], this.data) ?? fallback; }
      set(key, value) {
        const parts = key.split('.');
        const last = parts.pop();
        const object = parts.reduce((obj, part) => obj[part], this.data);
        object[last] = structuredClone(value);
      }
    }
    const win = { isDestroyed: () => false, webContents: { send: (...args) => messages.push(args) } };
    const frame = { url: pathToFileURL(path.join(temp, 'src/index.html')).href };
    win.webContents.id = 1; win.webContents.mainFrame = frame;
    const event = { sender: win.webContents, senderFrame: frame };
    const context = vm.createContext({
      pathToFileURL, isTrustedSender, storedImagePath, sanitizeSettings, csvCell,
      path, fs, console, Store: MockStore, classify,
      app: { getPath: () => temp, on: () => {} },
      menubar: () => ({ window: win, on: () => {} }),
      ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
      recordClip: () => {}, resetStats: () => {},
      fileURLToPath: () => path.join(temp, 'main.js'),
    });
    vm.runInContext(source('main.js').replace(/^import .*;\n/gm, '').replace('import.meta.url', "'file:///main.js'"), context);
    const add = data => { context.data = data; vm.runInContext('handleNewClip(data)', context); };
    const addText = text => add({ type: 'text', text, html: '', timestamp: Date.now() });
    const addImage = hash => add({ type: 'image', imageHash: hash, imageBuffer: Buffer.from(hash), text: '[Изображение 10×10]', imageSize: {width: 10, height: 10}, timestamp: Date.now() });
    store.set('settings.maxHistory', 2);
    addText('pinned');
    const pinnedId = store.get('history')[0].id;
    handlers.get('toggle-pin')(event, pinnedId);
    addImage('A');
    const imagePath = store.get('history')[0].imagePath;
    addImage('B');
    assert.equal(store.get('history').length, 3);
    assert.equal(store.get('history')[0].imageHash, 'B');
    assert.equal(fs.readdirSync(path.dirname(imagePath)).length, 2);
    addImage('B');
    assert.equal(fs.readdirSync(path.dirname(imagePath)).length, 2, 'duplicate must not create orphan PNG');
    addText('newest');
    assert.equal(fs.existsSync(imagePath), false);
    assert.equal(store.get('history')[0].content, 'newest');
    assert.equal(store.get('history').at(-1).id, pinnedId);
    const secondImage = store.get('history')[1].imagePath;
    handlers.get('update-settings')(event, { maxHistory: 1 });
    assert.equal(fs.existsSync(secondImage), false);
    assert.equal(store.get('history').length, 2);
    handlers.get('delete-item')(event, store.get('history')[0].id);
    addImage('C');
    const finalImage = store.get('history')[0].imagePath;
    handlers.get('clear-history')(event);
    assert.equal(fs.existsSync(finalImage), false);
    assert.equal(store.get('history').length, 1);
    assert.equal(store.get('history')[0].id, pinnedId);
    assert.equal(messages.length, 9);
    assert.ok(messages.every(([channel]) => channel === 'history-changed'));
    handlers.get('update-settings')(event, { theme: 'dark' });
    assert.equal(handlers.get('get-theme')(event), 'dark');
    assert.deepEqual(messages.at(-1), ['theme-changed', 'dark']);
    handlers.get('update-settings')(event, { theme: 'light' });
    assert.equal(store.get('settings.theme'), 'light');
    assert.deepEqual(messages.at(-1), ['theme-changed', 'light']);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
