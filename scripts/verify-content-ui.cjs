const { app, BrowserWindow } = require('electron');

// Run with Electron while the local Vite preview is running. Uses test books only.
app.setPath('userData', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'study-interactions-')));
app.whenReady().then(async()=>{
 const w=new BrowserWindow({width:1440,height:960,show:true,webPreferences:{contextIsolation:true,backgroundThrottling:false}});
 w.webContents.on('console-message',event=>{if(event.level==='error')console.log('CONSOLE',event.message)});
 await w.loadURL('http://127.0.0.1:5173/tests/ui/content-interactions.html');
 await new Promise(r=>setTimeout(r,5000));
 console.log('UI',await w.webContents.executeJavaScript(`JSON.stringify({text:document.body.innerText.slice(0,2200),buttons:[...document.querySelectorAll('button')].map(e=>({text:e.innerText,label:e.getAttribute('aria-label')}))})`));
 // Exercise the item gesture with real pointer events, including both preceding clicks.
 const evaluate = code => w.webContents.executeJavaScript(code);
 const pause = () => new Promise(resolve => setTimeout(resolve, 300));
 async function doubleClickBook(index) {
   const point = await evaluate(`(() => {
     const card = document.querySelectorAll('.shelf-read')[${index}];
     card.scrollIntoView({block:'nearest'});
     const rect = card.getBoundingClientRect();
     return {x: Math.round(rect.left + rect.width/2), y: Math.round(rect.top + rect.height/2)};
   })()`);
   for (const clickCount of [1, 2]) {
     for (const type of ['mouseDown', 'mouseUp']) w.webContents.sendInputEvent({ type, ...point, button: 'left', clickCount });
   }
   await pause();
 }
 const selectAll = async () => {
   const modifiers = [process.platform === 'darwin' ? 'meta' : 'control'];
   for (const type of ['keyDown', 'keyUp']) w.webContents.sendInputEvent({type, keyCode:'A', modifiers});
   await pause();
 };
 w.focus();
 await selectAll();
 await doubleClickBook(1);
 if (!await evaluate("!!document.querySelector('dialog[data-bulk-editor][open]:not(:modal)')")) throw Error('Double-click did not open the batch sidebar');
 if (await evaluate("!!document.querySelector('[data-bulk-editor] input[type=file], .shelf-book[draggable=true]')")) throw Error('Batch mode enabled file editing or rearrangement');
 await doubleClickBook(0);
 if (await evaluate("!!document.querySelector('[data-bulk-editor]') || document.querySelectorAll('.shelf-book[data-bulk-selected]').length !== 3")) throw Error('Closing the sidebar changed the selection');
 await doubleClickBook(2);
 await selectAll();
 if (await evaluate("!!document.querySelector('[data-bulk-editor], [data-bulk-selected]')")) throw Error('Select all did not cancel the batch selection');
 w.focus();
 w.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['meta','shift']});
 w.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['meta','shift']});
 await new Promise(r=>setTimeout(r,800));
 console.log('CREATE',await w.webContents.executeJavaScript(`JSON.stringify([...document.querySelectorAll('dialog[open]')].map(e=>e.innerText))`));
 await w.webContents.executeJavaScript(`document.querySelector('dialog[open]')?.dispatchEvent(new Event('cancel',{cancelable:true}));`);
 await new Promise(r=>setTimeout(r,600));
 const originalLayout=await w.webContents.executeJavaScript(`({width:document.querySelector('.shelf-book').getBoundingClientRect().width,columns:getComputedStyle(document.querySelector('.cover-shelves')).gridTemplateColumns})`);
 await w.webContents.executeJavaScript(`document.querySelector('.shelf-read').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,button:0,detail:2}));`);
 await new Promise(r=>setTimeout(r,800));
 const editingLayout=await w.webContents.executeJavaScript(`({width:document.querySelector('.shelf-book').getBoundingClientRect().width,columns:getComputedStyle(document.querySelector('.cover-shelves')).gridTemplateColumns})`);
 if(Math.abs(originalLayout.width-editingLayout.width)>1 || originalLayout.columns!==editingLayout.columns) throw Error('Editing changed shelf geometry');
 console.log('GEOMETRY_PASS',editingLayout);
 await w.webContents.executeJavaScript(`document.querySelectorAll('.shelf-read')[1].dispatchEvent(new MouseEvent('click',{bubbles:true,button:0,detail:1}));`);
 await new Promise(r=>setTimeout(r,700));
 if(!await w.webContents.executeJavaScript(`document.querySelector('dialog[open] input[name=title]').value==='乙书'`)) throw Error('Click did not switch edited book');
 console.log('SWITCH_PASS');
 await w.webContents.executeJavaScript(`document.querySelectorAll('.shelf-read')[0].dispatchEvent(new MouseEvent('click',{bubbles:true,button:0,detail:1}));`);
 await new Promise(r=>setTimeout(r,700));
 console.log('EDIT',await w.webContents.executeJavaScript(`JSON.stringify({dialogs:[...document.querySelectorAll('dialog[open]')].map(e=>e.innerText),cards:[...document.querySelectorAll('.shelf-book')].map(e=>({visible:e.checkVisibility(),key:e.dataset.contentTarget,drag:e.draggable}))})`));
 if (await w.webContents.executeJavaScript(`[...document.querySelectorAll('.shelf-book')].some(card => card.draggable)`)) {
   throw Error('The library shelf must keep its chronological order');
 }
 w.focus();
 w.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['meta','shift']});
 w.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['meta','shift']});
 await new Promise(r=>setTimeout(r,800));
 console.log('CREATE_WHILE_EDITING',await w.webContents.executeJavaScript(`JSON.stringify([...document.querySelectorAll('dialog[open]')].map(e=>e.innerText))`));
 await w.webContents.executeJavaScript(`document.querySelector('dialog[open]').dispatchEvent(new Event('cancel',{cancelable:true}));`);
 await new Promise(r=>setTimeout(r,600));
 await w.webContents.executeJavaScript(`document.querySelector('.shelf-read').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,button:0,detail:2}));`);
 await new Promise(r=>setTimeout(r,600));
 await w.webContents.executeJavaScript(`const input=document.querySelector('dialog[open] input[name="title"]'); input.value='修改后的书名'; document.querySelector('dialog[open] form').requestSubmit();`);
 await new Promise(r=>setTimeout(r,1000));
 const saved=await w.webContents.executeJavaScript(`document.querySelector('.shelf-book-title').textContent`);
 if(saved !== '修改后的书名') throw Error('Save failed: '+saved);
 console.log('SAVE_PASS',saved);
 await w.webContents.executeJavaScript(`document.querySelector('.shelf-read').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,button:0,detail:2}));`);
 await new Promise(r=>setTimeout(r,600));
 await w.webContents.executeJavaScript(`[...document.querySelectorAll('dialog[open] button')].find(e=>e.textContent==='删除').click();`);
 await new Promise(r=>setTimeout(r,800));
 const count=await w.webContents.executeJavaScript(`document.querySelectorAll('.shelf-book').length`);
 if(count!==2) throw Error('Delete failed');
 console.log('DELETE_PASS',count);
 await w.reload(); await new Promise(r=>setTimeout(r,1200));
 console.log('RELOAD_ORDER',await w.webContents.executeJavaScript(`JSON.stringify([...document.querySelectorAll('.shelf-book')].map(e=>({key:e.dataset.contentTarget,order:e.style.order,left:e.getBoundingClientRect().left})))`));
 // The real toolbar changes the space available on both sides of the page.
 for (const [feature, target] of [['music', '.record-deck'], ['', '.shelf-book']]) {
   await w.loadURL('http://127.0.0.1:5173/tests/ui/content-interactions.html?feature=' + feature);
   const measure = () => evaluate(`document.querySelector('${target}').getBoundingClientRect().toJSON()`);
   const clickEdit = () => evaluate("document.querySelector('#page-command-buttons button:nth-child(4)').click()");
   for (const width of [800, 1200, 1600]) {
     w.setSize(width, 900);
     await new Promise(resolve => setTimeout(resolve, 550));
     const before = await measure();
     await clickEdit();
     await evaluate(`document.querySelector('${target}').click()`);
     await new Promise(resolve => setTimeout(resolve, 550));
     const after = await measure();
     const railRight = await evaluate("document.querySelector('dialog.edit-sidebar[open]').getBoundingClientRect().right");
     if (after.left <= before.left || after.left < railRight || after.width !== before.width)
       throw Error(`Editing ${target} at ${width}px moved or resized it incorrectly`);
     await clickEdit();
     await new Promise(resolve => setTimeout(resolve, 550));
     if ((await measure()).left !== before.left) throw Error(`${target} did not recenter`);
   }
 }
 console.log('TOOLBAR_EDIT_LAYOUT_PASS');
 app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
