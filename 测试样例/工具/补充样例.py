from pathlib import Path
import sys,json,struct,shutil,hashlib,random,io
sys.path.insert(0,'/private/tmp/cyber-fixture-deps')
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parents[1]
def write(rel,data):
 p=R/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data) if isinstance(data,bytes) else p.write_text(data,encoding='utf8');return p
def js(rel,data):return write(rel,json.dumps(data,ensure_ascii=False,indent=2))
# Current globe backup schema, intentionally isolated from real app data.
base=R/'01_地球仪/正常照片/旅程1';photos=[]
for i,p in enumerate(sorted(base.glob('*.jpg'))[:4]):
 b=p.read_bytes();h=hashlib.sha256(b).hexdigest();write(f'11_备份恢复/地球仪_有效/assets/{h}.original',b)
 for kind,size in [('preview',1800),('thumb',360)]:
  im=Image.open(p);im.thumbnail((size,size));buf=io.BytesIO();im.save(buf,format='JPEG');write(f'11_备份恢复/地球仪_有效/assets/{h}.{kind}',buf.getvalue())
 photos.append(dict(id=f'fixture-photo-{i}',hash=h,location='杭州' if i<3 else '',caption=f'合成备份样例{i}',date='2025-03-01',dateSource='exif',latitude=30.2741 if i<3 else None,longitude=120.1551 if i<3 else None,locationSource='exif' if i<3 else 'unknown',locationStatus='confirmed' if i<3 else 'pending',createdAt='2026-11-14T00:00:00Z',deletedAt='2026-11-14T00:01:00Z' if i==2 else None))
backup={'version':2,'photos':photos,'migrations':[]};js('11_备份恢复/地球仪_有效/library.json',backup)
js('11_备份恢复/地球仪_缺原图/library.json',backup)
js('11_备份恢复/地球仪_版本错误/library.json',{'version':999,'photos':[],'migrations':[]})
# No migration injection: exact legacy format supplied for future harness, all source entries fictional.
js('11_备份恢复/旧数据_仅供隔离迁移测试.json',{'cyber-study.space.v1.diary':[{'id':'fixture-diary','text':'合成迁移日记 DIARY-PRIVATE-LEGACY','date':'2025-03-01T02:00:00Z','mood':'平静','photo':''}],'cyber-study.space.v1.knowledge':{'notes':[{'id':'fixture-note','bookId':'fixture-book','bookTitle':'沿河慢行','quote':'城市记忆依赖线索','annotation':'旧版笔记','tags':['迁移测试'],'progress':.5,'source':'沿河慢行','createdAt':'2025-03-01T00:00:00Z','origin':'user'}],'projects':[]}})
# Minimal self-contained GLB cube, one shared mesh across all feature objects.
pos=[(-.5,0,-.5),(.5,0,-.5),(.5,1,-.5),(-.5,1,-.5),(-.5,0,.5),(.5,0,.5),(.5,1,.5),(-.5,1,.5)]
indices=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,1,2,6,1,6,5,0,4,7,0,7,3]
bin_data=b''.join(struct.pack('<3f',*p) for p in pos)+struct.pack('<36H',*indices)
gltf={'asset':{'version':'2.0','generator':'cyber-study-fixtures'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0}],'meshes':[{'primitives':[{'attributes':{'POSITION':0},'indices':1,'material':0}]}],'materials':[{'pbrMetallicRoughness':{'baseColorFactor':[.2,.65,.7,1],'metallicFactor':0,'roughnessFactor':.8},'doubleSided':True}],'buffers':[{'byteLength':len(bin_data)}],'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':96,'target':34962},{'buffer':0,'byteOffset':96,'byteLength':72,'target':34963}],'accessors':[{'bufferView':0,'componentType':5126,'count':8,'type':'VEC3','min':[-.5,0,-.5],'max':[.5,1,.5]},{'bufferView':1,'componentType':5123,'count':36,'type':'SCALAR'}]}
j=json.dumps(gltf).encode();j+=b' '*((-len(j))%4);glb=struct.pack('<4sII',b'glTF',2,12+8+len(j)+8+len(bin_data))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(bin_data),b'BIN\0')+bin_data
features=['shelf','desk','window','lamp','knowledge','music','movie','diary','memo','globe','typewriter','cat','plant','pet']
scene={'version':1,'name':'测试场景_功能方块阵列','models':[{'id':f,'file':'models/cube.glb','width':.6,'position':[(i%7-3)*1.1,0,-(i//7)*1.5],'feature':f} for i,f in enumerate(features)],'camera':{'position':[0,3,6],'fov':65,'pitch':-.35}}
write('12_场景包/正常功能阵列/models/cube.glb',glb);js('12_场景包/正常功能阵列/scene.json',scene)
for name,mutate in [('重复ID',lambda s:s['models'].append(s['models'][0].copy())),('路径越界',lambda s:s['models'][0].update(file='../outside.glb')),('非法视野',lambda s:s['camera'].update(fov=120)),('缺失模型',lambda s:s['models'][0].update(file='models/missing.glb'))]:
 s=json.loads(json.dumps(scene));mutate(s);js(f'12_场景包/异常/{name}/scene.json',s);write(f'12_场景包/异常/{name}/models/cube.glb',glb)
# Image sizing and transparency
im=Image.new('RGBA',(600,600),(0,0,0,0));d=ImageDraw.Draw(im);d.ellipse((40,40,560,560),fill=(70,170,180,180));p=R/'06_日记便签/透明贴纸.png';im.save(p)
rng=random.Random(2026);im=Image.frombytes('RGB',(1100,1100),rng.randbytes(1100*1100*3));im.save(R/'09_异常样例/超过2MB_日记便签限制.png')
p=R/'09_异常样例/超过80MB_照片大小限制.jpg'
with p.open('wb') as f:f.write((base/'01_杭州.jpg').read_bytes());f.seek(81*1024*1024-1);f.write(b'\0')
# Distinct large-list records; these require future adapters, never injected into storage.
js('08_批量压力/知识记录1000_契约样例.json',[{'id':f'LOAD-{i:04d}','title':f'城市记忆笔记 {i:04d}','body':f'唯一检索词 LOAD-NOTE-{i:04d}。注意力、旅行与回忆。','project':f'项目{i%10}','tags':[f'主题{i%20}'],'sourceId':f'P{i%6+1:02d}','aiAllowed':i%10!=0} for i in range(1000)])
write('02_学术/题录/测试作者年份.csl','''<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" version="1.0" class="in-text" default-locale="zh-CN"><info><title>Cyber Study Test Author Year</title><id>https://example.invalid/styles/cyber-study-test</id><updated>2026-11-14T00:00:00+00:00</updated></info><citation><layout prefix="(" suffix=")" delimiter="; "><group delimiter=", "><names variable="author"><name form="short"/></names><date variable="issued"><date-part name="year"/></date></group></layout></citation><bibliography><layout><group delimiter=". "><names variable="author"><name/></names><date variable="issued"><date-part name="year"/></date><text variable="title"/></group></layout></bibliography></style>''')
print('Supplementary assets created')
