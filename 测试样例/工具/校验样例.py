from pathlib import Path
import sys,json,hashlib,subprocess,zipfile,xml.etree.ElementTree as ET,collections
sys.path.insert(0,'/private/tmp/cyber-fixture-deps')
from PIL import Image
import pillow_heif,imageio_ffmpeg,piexif
from pypdf import PdfReader
from docx import Document
pillow_heif.register_heif_opener();R=Path(__file__).resolve().parents[1];checks=collections.Counter();fail=[]
def check(label,fn):
 try:fn();checks[label]+=1
 except Exception as e:fail.append({'check':label,'error':str(e)})
def imagecheck(p):
 with Image.open(p) as im:im.load();assert im.width>0
for folder in ['01_地球仪','05_电影','06_日记便签','08_批量压力/照片300']:
 for p in (R/folder).rglob('*'):
  if p.suffix.lower() in ['.jpg','.png','.webp','.heic']:check('图片实际解码',lambda p=p:imagecheck(p))
for p in (R/'02_学术').rglob('*.pdf'):
 def f(p=p):
  r=PdfReader(p);text=''.join(x.extract_text() or '' for x in r.pages)
  if p.name.startswith('全文版式'):assert len(r.pages)==2 and 'LEFT-01' in text and 'LANDSCAPE-01' in text
  elif p.name.startswith('OCR'):assert len(r.pages)==2 and not text.strip()
  elif p.name.startswith('混合'):assert len(r.pages)==5 and 'ANCHOR-P01-RESULT' in text and not r.pages[3].extract_text().strip()
  else:assert len(r.pages)==3 and 'ANCHOR-' in text
 check('PDF页数与文字层',f)
for p in (R/'02_学术/Word').glob('*.docx'):
 check('DOCX结构与表格',lambda p=p: (Document(p).tables[0].cell(0,0).text=='研究') or (_ for _ in ()).throw(Exception('table missing')))
for p in (R/'03_电子书/EPUB').glob('*.epub'):
 def f(p=p):
  with zipfile.ZipFile(p) as z:
   assert z.namelist()[0]=='mimetype' and z.getinfo('mimetype').compress_type==0
   assert z.read('mimetype')==b'application/epub+zip'
   for n in z.namelist():
    if n.endswith(('.xml','.opf','.xhtml')):ET.fromstring(z.read(n))
   root=ET.fromstring(z.read('OEBPS/package.opf'));ns={'o':'http://www.idpf.org/2007/opf'}
   for it in root.findall('o:manifest/o:item',ns):assert 'OEBPS/'+it.attrib['href'] in z.namelist()
   assert len(root.findall('o:spine/o:itemref',ns))==6
 check('EPUB容器目录链接',f)
for p in list((R/'04_音乐').rglob('*'))+list((R/'08_批量压力/音频60').rglob('*.wav')):
 if p.is_file():check('音频完整解码',lambda p=p:subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-i',str(p),'-f','null','-'],check=True,capture_output=True))
for p in (R/'03_电子书/编码').glob('*.txt'):
 check('文本编码',lambda p=p: '城市记忆' in p.read_bytes().decode(p.stem.split('_',1)[1]) or (_ for _ in ()).throw(Exception('text missing')))
# Compare production metadata parser with fixture truth.
manifest=json.loads((R/'样例清单.json').read_text());known={r['path']:r for r in manifest['files']}
node='/Users/hengtang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
script="const fs=require('fs');const {metadata}=require('./electron/globe/metadata.cjs');const m=JSON.parse(fs.readFileSync('测试样例/样例清单.json'));let count=0;for(const r of m.files){if(!r.path.startsWith('01_地球仪/正常照片')&&!r.path.startsWith('08_批量压力/照片300'))continue;const x=metadata(fs.readFileSync('测试样例/'+r.path));if(Math.abs(x.latitude-r.latitude)>0.000001||Math.abs(x.longitude-r.longitude)>0.000001||x.date!==r.date.slice(0,10).replaceAll(':','-'))throw Error(r.path);count++;}console.log(count);"
check('生产JPEG解析器坐标日期324张',lambda:subprocess.run([node,'-e',script],cwd=R.parent,check=True,capture_output=True))
# Genuine exact duplicate pairs.
for a,b in [('01_地球仪/正常照片/旅程1/01_杭州.jpg','01_地球仪/重复照片/改名但字节完全相同.jpg'),('03_电子书/正常/01_沿河慢行.md','03_电子书/重复与版本/沿河慢行_完全相同.md'),('04_音乐/正常/城市回声/01_雨后步行.mp3','04_音乐/重复/改名重复.mp3'),('02_学术/全文/P01_步行与延迟回忆.pdf','02_学术/版本与重复/P01_完全重复改名.pdf')]:
 check('重复文件字节一致',lambda a=a,b=b:(R/a).read_bytes()==(R/b).read_bytes() or (_ for _ in ()).throw(Exception(a)))
# Every added artifact enters inventory; validation report itself intentionally excluded.
rows=[]
for p in sorted(R.rglob('*')):
 if not p.is_file() or p.name in ['样例清单.json','校验报告.json'] or '__pycache__' in str(p):continue
 rel=str(p.relative_to(R));row=known.get(rel,{'path':rel,'case':'配套素材','expected':'见00_测试路线.md','mode':'按说明使用'})
 row.update(size=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest());rows.append(row)
manifest['files']=rows;(R/'样例清单.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
report={'status':'pass' if not fail else 'fail','checks':dict(checks),'failures':fail,'files':len(rows),'bytes':sum(r['size'] for r in rows),'acceptanceCriteria':manifest['acceptanceCriteria'],'scope':'文件解码与结构校验，不是应用端到端验收','intentionalInvalidFiles':'09_异常样例与12_场景包/异常不计入正常解码通过要求'}
(R/'校验报告.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2));sys.exit(bool(fail))
