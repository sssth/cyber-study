const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'study-order-')));
app.whenReady().then(async () => {
  const win = new BrowserWindow({show:false, webPreferences:{backgroundThrottling:false}});
  const run = code => win.webContents.executeJavaScript(code);
  const wait = async condition => {
    for (let i=0;i<100;i++) {
      if (await run(condition)) return;
      await new Promise(resolve => setTimeout(resolve,50));
    }
    throw Error(condition);
  };
  const keys = selector => run(`[...document.querySelectorAll(${JSON.stringify(selector)})].map(node=>node.dataset.contentTarget)`);
  const card = id => `document.querySelector('[data-content-target="${id}"]')`;
  const edit = async id => {
    await wait(card(id));
    await run(`${card(id)}.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,button:0,detail:2}))`);
    await wait(card(id)+'.draggable');
  };
  const move = (source,target) => run(`(() => {
    const transfer=new DataTransfer();
    for(const [node,event] of [[${card(source)},'dragstart'],[${card(target)},'dragover'],[${card(target)},'drop'],[${card(source)},'dragend']])
      node.dispatchEvent(new DragEvent(event,{bubbles:true,cancelable:true,dataTransfer:transfer}));
  })()`);
  await win.loadURL('http://127.0.0.1:5173/tests/ui/map-projection.html');
  await run("previewPage('catalog')");
  await wait("document.querySelector('.catalog-columns')");
  await run("[...document.querySelectorAll('.shelf-view-bar button')].find(button => button.textContent === '全部实体').click()");
  await edit('book:b0');
  const selector='.entity-catalog > [data-content-target]';
  const before=await keys(selector);
  const a=before.indexOf('book:b0'), b=before.indexOf('book:b1');
  assert.ok(before.slice(a+1,b).includes('movie:f1'));
  await move('book:b1','movie:f1');
  assert.deepEqual(await keys(selector),before);
  await move('book:b1','book:b0');
  const after=[...before];
  [after[a],after[b]]=[after[b],after[a]];
  assert.deepEqual(await keys(selector),after);
  await run("previewPage('library')");
  await edit('book:b1');
  assert.deepEqual((await keys('.shelf-book')).slice(0,2),['book:b1','book:b0']);
  await move('book:b0','book:b1');
  await run("previewPage('catalog')");
  await wait("document.querySelector('.catalog-columns')");
  await run("[...document.querySelectorAll('.shelf-view-bar button')].find(button => button.textContent === '全部实体').click()");
  await wait(card('book:b0'));
  assert.deepEqual(await keys(selector),before);
  console.log('Catalog and library order synchronized in both directions; other slots stayed fixed.');
  app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
