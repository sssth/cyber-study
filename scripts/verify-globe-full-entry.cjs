const {app,BrowserWindow}=require('electron');const fs=require('fs'),os=require('os'),path=require('path');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'study-globe-full-')));
app.whenReady().then(async()=>{
 const w=new BrowserWindow({width:1440,height:1000,show:true,webPreferences:{backgroundThrottling:false}}),run=s=>w.webContents.executeJavaScript(s),pause=()=>new Promise(r=>setTimeout(r,250));
 const wait=async s=>{for(let i=0;i<80;i++){if(await run(s))return;await pause();}throw Error(s);};
 const key=async(k,modifiers=[])=>{w.focus();w.webContents.sendInputEvent({type:'keyDown',keyCode:k,modifiers});w.webContents.sendInputEvent({type:'keyUp',keyCode:k,modifiers});await pause();};
 const toggle=()=>key('Z',['meta','shift']);
 const mode=async label=>{await run(`(()=>{const panel=document.querySelector('.map-projection');const menu=panel.querySelector('.display-menu-toggle');if(menu.getAttribute('aria-expanded')!=='true')menu.click();[...panel.querySelectorAll('.globe-mode-switch button')].find(b=>b.textContent==='${label}').click()})()`);await pause();};
 await w.loadURL('http://127.0.0.1:5173/tests/ui/map-projection.html');await wait('!!window.previewPage');await key('X',['meta','shift']);await wait(`!!document.querySelector('.map-projection .memory-atlas')`);
 await wait(`document.querySelector('.map-projection .memory-atlas').dataset.highlightIds==='p1,p3'`);
 await toggle();await wait(`!!document.querySelector('.map-projection .unified-search')`);await w.webContents.insertText('中国');await pause();await toggle();
 await mode('记忆点');await wait(`document.querySelectorAll('.map-projection .memory-point-card').length===4`);
 await toggle();await w.webContents.insertText('p1');await wait(`document.querySelectorAll('.map-projection .memory-point-card').length===1`);await toggle();await wait(`document.querySelectorAll('.map-projection .memory-point-card').length===4`);
 await mode('旅程');await toggle();await w.webContents.insertText('旅途甲');await wait(`document.querySelectorAll('.map-projection .journey-summary-card').length===1`);await toggle();
 await mode('3D 浏览');await wait(`document.querySelector('.map-projection .memory-atlas')?.dataset.highlightIds==='p1,p3'`);
 await key('Escape');await wait(`!document.querySelector('.map-projection')&&!!document.querySelector('.memo-board')`);
 console.log('GLOBE_FULL_ENTRY_PASS: shared menu, 3D search, point search, journey search, preserved selection, source return');app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
