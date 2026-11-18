const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'study-catalog-edit-')));
app.whenReady().then(async () => {
  const window = new BrowserWindow({width:1280,height:900,show:false,webPreferences:{backgroundThrottling:false}});
  const run = script => window.webContents.executeJavaScript(script);
  await window.loadURL('http://127.0.0.1:5173/tests/ui/map-projection.html');
  await run(`localStorage.setItem('cyber-study.space.v1.knowledge', JSON.stringify({notes:[{id:'n1',bookId:'b0',quote:'测试摘录',annotation:'测试批注'}]})); previewPage('catalog')`);
  const wait = async script => {
    for (let i=0;i<100;i++) {
      if (await run(script)) return;
      await new Promise(resolve => setTimeout(resolve,50));
    }
    throw Error(script);
  };
  await wait("!!document.querySelector('.entity-catalog [data-content-target]')");
  await run("window.originalCatalog=document.querySelector('.entity-catalog')");
  for (const key of ['movie:f1','book:b0','memo:m2','todo:t1','diary:d0','typing_work:w1','journey:j1','memory_point:p1','music:s1','playlist:l1','excerpt:n1','annotation:n1']) {
    await run(`document.querySelector('.entity-catalog [data-content-target="${key}"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
    await wait("document.querySelector('dialog.edit-sidebar[open]') && document.querySelector('.entity-catalog')===originalCatalog && document.querySelectorAll('.feature-overlay').length===1");
    if(key==='movie:f1') {
      await run(`const form=document.querySelector('dialog[open] form');const title=form.querySelector('[placeholder^="影片名称"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(title,'知识库编辑验证');title.dispatchEvent(new Event('input',{bubbles:true}));form.requestSubmit();`);
      await wait("document.querySelector('[data-content-target=\"movie:f1\"] strong').textContent==='知识库编辑验证'");
    } else {
      if (key === 'excerpt:n1') {
        await run("[...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent==='调整摘录范围').click()");
        await wait("!!document.querySelector('dialog[open] .catalog-range-editor') && document.querySelector('.entity-catalog')===originalCatalog");
      }
      await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
    }
    await wait("!document.querySelector('dialog.edit-sidebar[open]')");
    console.log(key, 'OK');
  }
  app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
