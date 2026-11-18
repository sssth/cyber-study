const{app,BrowserWindow}=require('electron');const fs=require('fs'),os=require('os'),path=require('path');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'study-search-layout-')));
app.whenReady().then(async()=>{
 const w=new BrowserWindow({width:1280,height:900,show:true,webPreferences:{backgroundThrottling:false}}),run=s=>w.webContents.executeJavaScript(s),pause=()=>new Promise(r=>setTimeout(r,350));
 const key=async(k,modifiers=[])=>{w.focus();w.webContents.sendInputEvent({type:'keyDown',keyCode:k,modifiers});w.webContents.sendInputEvent({type:'keyUp',keyCode:k,modifiers});await pause();};
 await w.loadURL('http://127.0.0.1:5173/tests/ui/map-projection.html');await pause();
 for(const [page,label,selector] of [['catalog',null,'.entity-catalog > button'],['movie',null,'.movie-tile'],['typewriter',null,'.copying-work-card'],['memo','便签','.memo-item'],['globe','记忆点','.memory-status-column'],['globe','旅程','.journey-summary-card'],['reader',null,'.book-card']]){
  await run(`previewPage('${page}')`);await pause();
  if(label){await run(`document.querySelector('.display-menu-toggle').click();[...document.querySelectorAll('button')].find(b=>b.textContent==='${label}').click()`);await pause();}
  if(page==='catalog'){
   const measure=()=>run("document.querySelector('.entity-catalog > button').getBoundingClientRect().width");
   const original=await measure();
   await run('previewEdit()');await pause();
   if(Math.abs(await measure()-original)>1)throw Error('Catalog cards changed width with the sidebar open');
   await run("document.querySelector('dialog[open]').dispatchEvent(new Event('cancel',{cancelable:true}))");await pause();
  }
  if(page==='reader')await key('Escape');
  const before=await run(`document.querySelector('${selector}').getBoundingClientRect().top`);
  await key('Z',['meta','shift']);
  const result=await run(`({top:document.querySelector('${selector}').getBoundingClientRect().top,bottom:document.querySelector('.unified-search-row').getBoundingClientRect().bottom,filter:!!document.querySelector('.search-filter-toggle'),placeholder:document.querySelector('.unified-search input').placeholder})`);
  if(Math.abs(result.top-before)>1||result.top<result.bottom+8||!result.filter||result.placeholder)throw Error(JSON.stringify({page,label,result}));
  await run(`document.querySelector('.unified-search input').focus()`);await w.webContents.insertText('不存在的条目987654321');await pause();
  const empty=await run(`({count:document.querySelector('.search-result-count')?.textContent,text:document.body.innerText})`);
  if(empty.count!=='0'||/没有匹配|没有符合|暂无匹配|暂无可关联/.test(empty.text))throw Error('Empty search mismatch: '+page+' '+empty.count);
  await key('Z',['meta','shift']);const restored=await run(`document.querySelector('${selector}').getBoundingClientRect().top`);if(Math.abs(restored-before)>1)throw Error('Layout not restored: '+page);
  console.log(page,label,result);
 }
 console.log('SEARCH_LAYOUT_PASS');app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
