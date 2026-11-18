const {app,BrowserWindow}=require('electron');
const fs=require('fs'),os=require('os'),path=require('path');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'study-layout-')));
app.whenReady().then(async()=>{const w=new BrowserWindow({width:1440,height:960,show:true,webPreferences:{backgroundThrottling:false}});
for(const width of [1440,900]) { w.setSize(width,960);
for(const feature of ['typewriter','memo','movie']) {
 await w.loadURL('http://127.0.0.1:5173/tests/ui/content-interactions.html?feature='+feature);await new Promise(r=>setTimeout(r,1800));
 if(feature!=='movie'){await w.webContents.executeJavaScript(`document.querySelector('[data-content-target]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,button:0,detail:2}))`);}
 else {w.focus();w.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['meta','shift']});w.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['meta','shift']});}
 await new Promise(r=>setTimeout(r,1000));
 const result=await w.webContents.executeJavaScript(`(()=>{const sidebar=document.querySelector('dialog.edit-sidebar[open]');const footer=sidebar?.querySelector('.edit-actions');const body=document.querySelector('.feature-body');return {sidebar:sidebar?.getBoundingClientRect().toJSON(),footer:footer?.getBoundingClientRect().toJSON(),body:body?.getBoundingClientRect().toJSON(),viewport:innerWidth,buttons:[...footer?.querySelectorAll('button')||[]].map(b=>b.textContent)};})()`);
 console.log(feature,JSON.stringify(result));if(!result.footer||result.body.right>result.viewport+1||Math.abs(result.sidebar.bottom-result.footer.bottom-18)>2)throw Error(feature+' layout failed');
 if(feature==='typewriter')fs.writeFileSync('/tmp/study-workspace-verified.png',(await w.webContents.capturePage()).toPNG());
}
}
app.quit();}).catch(e=>{console.error(e);app.exit(1)});
