const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const assert=require('node:assert/strict');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'study-entity-graph-')));
app.whenReady().then(async()=>{
  const win=new BrowserWindow({width:1280,height:850,show:false,webPreferences:{backgroundThrottling:false}});
  const run=code=>win.webContents.executeJavaScript(code);
  const wait=async code=>{
    for(let i=0;i<100;i++){if(await run(code))return;await new Promise(resolve=>setTimeout(resolve,50));}
    throw Error(code);
  };
  await win.loadURL('http://127.0.0.1:5173/tests/ui/map-projection.html');
  await run("localStorage.setItem('cyber-study.space.v1.knowledge',JSON.stringify({notes:[{id:'n',bookId:'b0',quote:'原文',annotation:'测试批注'}]}));const linksKey='cyber-study.space.v1.content-relations';const links=JSON.parse(localStorage.getItem(linksKey));localStorage.setItem(linksKey,JSON.stringify([...links,...Array.from({length:45},(_,i)=>({fromId:'memo:m2',toId:'book:b'+i,relationType:'related'}))]));previewPage('catalog')");
  await wait("document.querySelectorAll('.entity-catalog > button').length");
  const total=await run("document.querySelectorAll('.entity-catalog > button').length");
  await run("document.querySelector('.display-menu-toggle').click();[...document.querySelectorAll('.shelf-view-bar button')].find(b=>b.textContent==='实体关系图').click()");
  await wait("document.querySelector('.entity-graph-node')");
  const count=()=>run("document.querySelectorAll('.entity-graph-node').length");
  assert.equal(await count(),total);
  for(const kind of ['contains','direct','related'])await wait(`document.querySelector('[data-relation="${kind}"]')`);
  const relatedCount = await run("document.querySelectorAll('[data-relation=related]').length");
  const node = await run(`(() => {
    const target = document.querySelector('.entity-graph-node[title=影片乙] strong');
    target.scrollIntoView({block:'center',inline:'center'});
    const bounds = target.getBoundingClientRect();
    return {x:Math.round(bounds.x+bounds.width/2),y:Math.round(bounds.y+bounds.height/2)};
  })()`);
  win.webContents.debugger.attach('1.3');
  for (const type of ['mousePressed','mouseReleased']) {
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {type,...node,button:'right',clickCount:1});
  }
  win.webContents.debugger.detach();
  await wait("document.querySelector('.content-relation-dialog[open] h2')?.textContent==='影片乙'");
  await run("[...document.querySelectorAll('.relation-header-actions button')].find(button=>button.textContent==='添加关联').click()");
  await wait("[...document.querySelectorAll('.relation-browser article strong')].some(node=>node.textContent==='板上')");
  await run("[...document.querySelectorAll('.relation-browser article')].find(article=>article.querySelector('strong').textContent==='板上').querySelector('button').click()");
  await wait("document.querySelectorAll('[data-relation=related]').length==="+(relatedCount+1));
  await run("document.querySelector('[aria-label=关闭关联面板]').click()");
  const height = await run("document.querySelector('.entity-graph-viewport').clientHeight");
  await run("document.querySelector('.entity-graph-node[title=板外]').click()");
  await wait("document.querySelectorAll('.entity-graph-relations li').length === 46");
  assert.equal(await run("document.querySelector('.entity-graph-viewport').clientHeight"), height);
  assert.ok(await run("(() => { const list=document.querySelector('.entity-graph-relations');list.scrollTop=999;return list.scrollTop>0; })()"));
  assert.equal(await run("document.querySelector('.entity-graph-detail-title small').textContent"), '便签');
  assert.equal(await run("document.querySelectorAll('.entity-graph-detail header button').length"), 1);
  const distantNode = ".entity-graph-node[title=测试书43]";
  await run(`document.querySelector('${distantNode}').click()`);
  await wait(`document.querySelector('${distantNode}').getAttribute('aria-pressed')==='true'`);
  await run("document.querySelector('.entity-graph-tools button').click()");
  await wait("document.querySelectorAll('.entity-graph-node').length===2");
  await run("document.querySelector('.entity-graph-tools button').click()");
  await wait("document.querySelectorAll('.entity-graph-node').length==="+total);
  assert.ok(await run(`(() => {
    const canvas=document.querySelector('.entity-graph-viewport');
    const view=canvas.getBoundingClientRect(), node=document.querySelector('${distantNode}').getBoundingClientRect();
    return canvas.scrollTop>0 && node.top>=view.top && node.bottom<=view.bottom;
  })()`));
  await run("document.querySelector('.entity-graph-node[title=\"旅途甲\"]').click()");
  await wait("document.querySelector('.entity-graph-tools button:not(:disabled)')");
  await run("document.querySelector('.entity-graph-tools button').click()");
  await wait("document.querySelectorAll('.entity-graph-node').length===3");
  assert.equal(await count(),3);
  await run("document.querySelector('.entity-graph-tools button').click();document.querySelector('.entity-graph-viewport').click();filterPreview('entity-graph','测试批注')");
  await wait("document.querySelectorAll('.entity-graph-node').length===2");
  assert.equal(await count(),2);
  await run("document.querySelector('.entity-graph-node[title=\"测试批注\"]').click()");
  await wait("document.querySelector('.entity-graph-detail')");
  assert.equal(await run("!!document.querySelector('dialog.edit-sidebar[open]')"),false);
  assert.equal(await run("[...document.querySelectorAll('.entity-graph-detail button')].some(b=>b.textContent==='编辑')"),false);
  await run(`document.querySelector('.entity-graph-node[title="测试批注"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,button:0,detail:2}))`);

  await wait("document.querySelector('dialog[open] textarea') && document.querySelector('.entity-graph')");
  await run("document.querySelector('.entity-graph-node[title=原文]').click()");
  await wait("document.querySelector('dialog[open][aria-label=\"编辑摘录\"]') && !document.querySelector('dialog[open][aria-label=\"编辑批注\"]')");
  await run("window.dispatchEvent(new Event('cyber-exit-item-edit'));filterPreview('entity-graph','');[...document.querySelectorAll('.shelf-view-bar button')].find(b=>b.textContent==='全部实体').click()");
  await wait("document.querySelectorAll('.entity-catalog > button').length==="+total);
  const toggleSearch = () => run("window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',metaKey:true,shiftKey:true,bubbles:true,cancelable:true}))");
  const switchView = label => run(`[...document.querySelectorAll('.shelf-view-bar button')].find(b=>b.textContent===${JSON.stringify(label)}).click()`);
  const input = "document.querySelector('[role=searchbox]')";
  async function searchFor(text, type) {
    await run(`{const el=${input};Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}));}`);
    await run("document.querySelector('.search-filter-toggle').click()");
    await run("document.querySelector('.search-choice > button').click()");
    await run(`[...document.querySelectorAll('.search-choice-options button')].find(b=>b.textContent===${JSON.stringify(type)}).click()`);
  }
  await toggleSearch();
  await wait(input);
  await searchFor('测试书','书籍');
  await switchView('实体关系图');
  await wait('!'+input);
  await toggleSearch();
  await wait(input+".value===''");
  assert.equal(await run("!!document.querySelector('.search-filter-toggle[data-active]')"),false);
  await searchFor('测试批注','批注');
  for (const [page,text,type] of [['全部实体','测试书','书籍'],['实体关系图','测试批注','批注']]) {
    await switchView(page);
    await wait('!'+input);
    await toggleSearch();
    await wait(input+'.value==='+JSON.stringify(text));
    await run("document.querySelector('.search-filter-toggle').click()");
    assert.ok((await run("document.querySelector('.search-choice > button').textContent")).includes(type));
  }
  await run("document.querySelector('.entity-graph-node[title=测试批注]').click()");
  await wait("!!document.querySelector('.entity-graph-detail-title')");
  await run("document.querySelector('.entity-graph-detail-title').click()");
  await wait("!document.querySelector('.entity-graph')");
  console.log('右键新增关联、连线即时更新、三类关系、局部图、独立搜索及原位编辑验证通过。');
  app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
