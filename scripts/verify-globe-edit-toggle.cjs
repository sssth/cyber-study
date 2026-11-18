const{app,BrowserWindow}=require('electron');const fs=require('fs'),os=require('os'),path=require('path');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'study-globe-edit-')));
app.whenReady().then(async()=>{
 const w=new BrowserWindow({width:1440,height:1000,show:true,webPreferences:{backgroundThrottling:false}}),run=s=>w.webContents.executeJavaScript(s),pause=()=>new Promise(r=>setTimeout(r,250));
 const wait=async s=>{for(let i=0;i<80;i++){if(await run(s))return;await pause();}throw Error(s);};
 const double=async prefix=>{const p=await run(`(()=>{const r=document.querySelector('${prefix} .atlas-stage').getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);w.focus();w.webContents.sendInputEvent({type:'mouseMove',...p});for(const clickCount of [1,2]){w.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount,...p});w.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount,...p});}await pause();};
 await w.loadURL('http://127.0.0.1:5173/tests/ui/map-projection.html');await wait('!!window.previewPage');await run("previewPage('globe')");await wait(`!!document.querySelector('.memory-atlas canvas')`);
 await double('.memory-atlas');await wait(`!!document.querySelector('dialog[aria-label="编辑地球"][open]')`);await double('.memory-atlas');await wait(`!document.querySelector('dialog[aria-label="编辑地球"][open]')`);
 await run("previewPage('memo')");await pause();w.webContents.sendInputEvent({type:'keyDown',keyCode:'X',modifiers:['meta','shift']});w.webContents.sendInputEvent({type:'keyUp',keyCode:'X',modifiers:['meta','shift']});await wait(`!!document.querySelector('.map-projection canvas')`);
 for(let i=0;i<2;i++){await double('.map-projection');await wait(`!!document.querySelector('.map-projection dialog[aria-label="编辑地球"][open]')`);await double('.map-projection');await wait(`document.querySelector('.map-projection')&&!document.querySelector('.map-projection dialog[aria-label="编辑地球"][open]')`);}
 console.log('GLOBE_EDIT_TOGGLE_PASS: real double clicks toggle shared globe controls in normal and shortcut entry');app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
