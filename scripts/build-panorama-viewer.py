from pathlib import Path
import re,json,base64
dest=Path('全景图查看/保留原图清晰度');dest.mkdir(parents=True,exist_ok=True)
package=Path(json.loads(Path('scene.config.json').read_text())['sceneFolder'])
scene=json.loads((package/'scene.json').read_text())
themes=scene['appearance']['themes']
selected={'day':themes[scene['appearance']['defaultTheme']]['panorama'], 'night':themes[scene['appearance']['nightTheme']]['panorama']}
names=['front','right','back','left','up','down','photo','sky']
sources={}
for mode, config in selected.items():
 sources[mode]={}
 for name in names:
  file=package/(config['front']['file'] if name=='photo' else config['skyRepair'] if name=='sky' else config['regions'][name])
  sources[mode][name]='data:image/'+('jpeg' if file.suffix=='.jpg' else 'png')+';base64,'+base64.b64encode(file.read_bytes()).decode()
shader=Path('src/scenes/three/regionalPanoramaShader.js').read_text().split('export const regionalPanoramaFragment = `')[1].split('`;')[0]
shader=shader.replace('uniform mat4 inverseProjection, cameraRotation;','uniform float yaw,pitch,aspect,fov;')
shader=shader.replace('vec4 viewRay = inverseProjection * vec4(screenPosition, 1.0, 1.0);\n    vec3 ray = normalize(mat3(cameraRotation) * viewRay.xyz);','''vec3 ray=normalize(vec3(screenPosition.x*aspect*tan(fov*.5),screenPosition.y*tan(fov*.5),-1.));
    float c=cos(pitch),s=sin(pitch);ray=vec3(ray.x,ray.y*c-ray.z*s,ray.y*s+ray.z*c);
    c=cos(yaw);s=sin(yaw);ray=vec3(ray.x*c-ray.z*s,ray.y,ray.x*s+ray.z*c);''').replace('#include <colorspace_fragment>','')
template='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Loft 日夜全景 · 保留原图清晰度</title><style>body{margin:0;background:#10141a;color:white;font:15px system-ui}canvas{width:100vw;height:100vh;display:block;touch-action:none;cursor:grab}nav{position:fixed;top:20px;left:20px;right:20px;display:flex;gap:8px;flex-wrap:wrap}button{border:1px solid #ffffff40;border-radius:8px;padding:10px 18px;color:white;background:#16232ee8;cursor:pointer}button[aria-pressed=true]{background:#dbeef6;color:#152733}footer{position:fixed;bottom:22px;left:22px;padding:10px 16px;border-radius:8px;background:#16232ed9}#status{position:fixed;right:22px;bottom:22px;background:#16232ed9;padding:10px;border-radius:8px}</style><canvas id="view" aria-label="可拖动的360度全景"></canvas><nav><button id="day" aria-pressed="true">白天</button><button id="night" aria-pressed="false">夜晚</button><button data-yaw="0">正面</button><button data-yaw="-90">左侧</button><button data-yaw="90">右侧</button><button data-yaw="180">背面</button><button data-pitch="85">向上看</button><button data-pitch="-85">向下看</button></nav><footer>拖动查看四周 · 滚轮缩放</footer><div id="status">加载中</div><script>
const sources=__SOURCES__;
const canvas=document.getElementById('view'),gl=canvas.getContext('webgl'),status=document.getElementById('status');
function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,'attribute vec2 pos; varying vec2 screenPosition; void main(){screenPosition=pos;gl_Position=vec4(pos,0.,1.);}'));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,'precision highp float;'+__SHADER__));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.useProgram(p);
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(p,'pos');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
const names=['front','right','back','left','up','down','photo','sky'];let yaw=0,pitch=0,fov=65*Math.PI/180,active='day',loaded={day:{},night:{}};
const uniforms=Object.fromEntries(['yaw','pitch','fov','aspect'].map(x=>[x,gl.getUniformLocation(p,x)]));
for(const [name,value] of Object.entries({faceTanHalfFov:80/65,faceAspect:1774/1576,frontTanHalfFov:80/65,frontAspect:1672/941,frontBlend:.006,hasSkyRepair:1}))gl.uniform1f(gl.getUniformLocation(p,name),value);
names.forEach((name,i)=>gl.uniform1i(gl.getUniformLocation(p,name==='photo'?'frontImage':name==='sky'?'skyRepair':'face'+name[0].toUpperCase()+name.slice(1)),i));
function draw(){const dpr=Math.min(devicePixelRatio,2);canvas.width=Math.round(innerWidth*dpr);canvas.height=Math.round(innerHeight*dpr);gl.viewport(0,0,canvas.width,canvas.height);if(Object.keys(loaded[active]).length!==8)return;names.forEach((n,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,loaded[active][n]);});gl.uniform1f(uniforms.yaw,yaw);gl.uniform1f(uniforms.pitch,pitch);gl.uniform1f(uniforms.fov,fov);gl.uniform1f(uniforms.aspect,canvas.width/canvas.height);gl.drawArrays(gl.TRIANGLES,0,6);status.textContent=`${active==='day'?'白天':'夜晚'} · ${Math.round((yaw*180/Math.PI+360)%360)}°`;}
for(const mode of ['day','night']){for(const name of names){const im=new Image();im.onload=()=>{const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,im);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);loaded[mode][name]=tex;draw();};im.src=sources[mode][name];}document.getElementById(mode).onclick=()=>{active=mode;for(const x of ['day','night'])document.getElementById(x).setAttribute('aria-pressed',x===mode);draw()};}
document.querySelectorAll('[data-yaw]').forEach(b=>b.onclick=()=>{yaw=Number(b.dataset.yaw)*Math.PI/180;pitch=0;draw()});document.querySelectorAll('[data-pitch]').forEach(b=>b.onclick=()=>{pitch=Number(b.dataset.pitch)*Math.PI/180;draw()});let pointer=null;canvas.onpointerdown=e=>{pointer=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId)};canvas.onpointermove=e=>{if(!pointer)return;yaw-=(e.clientX-pointer[0])*.004;pitch=Math.max(-1.55,Math.min(1.55,pitch+(e.clientY-pointer[1])*.004));pointer=[e.clientX,e.clientY];draw()};canvas.onpointerup=canvas.onpointercancel=()=>pointer=null;canvas.addEventListener('wheel',e=>{e.preventDefault();fov=Math.max(.4,Math.min(1.7,fov+e.deltaY*.001));draw()},{passive:false});addEventListener('resize',draw);draw();
</script></html>'''
(dest/'日夜全景查看.html').write_text(template.replace('__SOURCES__',json.dumps(sources)).replace('__SHADER__',json.dumps(shader)))
print(dest/'日夜全景查看.html')
