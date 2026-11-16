import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isTrustedSender, storedImagePath, sanitizeSettings, csvCell } from '../src/security.js';

test('IPC rejects other windows, remote pages and child frames', () => {
 const frame = {url:'file:///app/index.html'}, sender = {id:1,mainFrame:frame};
 assert.equal(isTrustedSender({sender,senderFrame:frame},[frame.url],[1]),true);
 assert.equal(isTrustedSender({sender,senderFrame:{url:frame.url}},[frame.url],[1]),false);
 assert.equal(isTrustedSender({sender,senderFrame:frame},['file:///other.html'],[1]),false);
 assert.equal(isTrustedSender({sender,senderFrame:frame},[frame.url],[2]),false);
});
test('image operations reject external files and symlinks', () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'clipvault-test-'));
 try {
  const image=path.join(dir,'clip_123_abc.png');fs.writeFileSync(image,'test');
  assert.equal(storedImagePath(image,dir),image);
  assert.throws(()=>storedImagePath(path.join(dir,'../outside.png'),dir));
  const link=path.join(dir,'clip_456_def.png');fs.symlinkSync(image,link);
  assert.throws(()=>storedImagePath(link,dir));
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('settings cannot inject paths, objects or unbounded polling',()=>{
 assert.deepEqual(sanitizeSettings({maxHistory:50,theme:'dark'}),{maxHistory:50,theme:'dark'});
 for(const value of [{pollInterval:0},{maxHistory:-1},{widgetPosition:{x:1}},{theme:'external'},[]]) assert.throws(()=>sanitizeSettings(value));
});
test('CSV exports neutralize spreadsheet formulas',()=>{
 for(const value of ['=1+1','+cmd',' @SUM(A1)','-1','\tformula']) assert.ok(csvCell(value).startsWith('"\''));
 assert.equal(csvCell('plain "text"'),'"plain ""text"""');
});
