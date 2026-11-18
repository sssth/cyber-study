const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'study-navigation-')));
app.whenReady().then(async()=>{
 const w=new BrowserWindow({width:1200,height:900,show:true,webPreferences:{backgroundThrottling:false}});
 await w.loadURL('http://127.0.0.1:5173/tests/ui/navigation-transitions.html');
 await new Promise(r=>setTimeout(r,1000));
 for(const action of ['navigatePreview','navigatePreview','openPreviewBook']){
  const result=await w.webContents.executeJavaScript(`new Promise(resolve=>{
   const frames=[],start=performance.now();window[${JSON.stringify(action)}]();
   function sample(){const panel=document.querySelector('.reader-overlay,.feature-overlay');const visible=panel?.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});const opacity=panel?getComputedStyle(panel).opacity:0;const library=!!document.querySelector('.library-mode');frames.push({visible,opacity,library});if(performance.now()-start<1000)requestAnimationFrame(sample);else resolve(frames);}requestAnimationFrame(sample);
  })`);
  if(result.some(frame=>!frame.visible||Number(frame.opacity)<.99))throw Error(action+': uncovered or transparent frame');
  if(action==='openPreviewBook'&&result.some(frame=>frame.library))throw Error('Book opened via a transient library frame');
  console.log(action,'PASS',result.length,'frames');
 }
 app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
