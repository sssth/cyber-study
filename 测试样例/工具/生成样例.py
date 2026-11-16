from pathlib import Path
import sys, json, csv, hashlib, shutil, math, struct, wave, subprocess, zipfile, io, html, random
sys.path.insert(0,'/private/tmp/cyber-fixture-deps')
from PIL import Image, ImageDraw, ImageFont
import piexif, pillow_heif, imageio_ffmpeg
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from docx import Document
from docx.shared import Pt
from pypdf import PdfReader, PdfWriter
pillow_heif.register_heif_opener()
ROOT=Path(__file__).resolve().parents[1]; REPO=ROOT.parent
FONT='/System/Library/Fonts/STHeiti Light.ttc'
pdfmetrics.registerFont(TTFont('STSong-Light','/System/Library/Fonts/Supplemental/Arial Unicode.ttf'))
manifest=[]
def path(rel):
 p=ROOT/rel; p.parent.mkdir(parents=True,exist_ok=True); return p
def write(rel,data):
 p=path(rel); p.write_bytes(data) if isinstance(data,bytes) else p.write_text(data,encoding='utf-8'); return p
def js(rel,data):return write(rel,json.dumps(data,ensure_ascii=False,indent=2))
def record(p,case,expected,mode='直接导入',**kw):
 manifest.append(dict(path=str(p.relative_to(ROOT)),case=case,expected=expected,mode=mode,**kw))
def art(label,index=0,size=(1200,800)):
 im=Image.new('RGB',size); d=ImageDraw.Draw(im); w,h=size; rng=random.Random(index)
 for y in range(h):d.line((0,y,w,y),fill=(int(25+70*y/h),int(55+75*y/h),int(95+50*y/h)))
 d.ellipse((w*.72,h*.12,w*.82,h*.12+w*.1),fill='#eacb8a')
 for k in range(3):
  points=[(0,h)]+[(x,int(h*(.46+k*.12)+rng.randint(-70,70))) for x in range(0,w+60,60)]+[(w,h)]
  d.polygon(points,fill=['#536e75','#38565f','#233d4b'][k])
 d.rectangle((0,h*.78,w,h),fill='#142e3b')
 f=ImageFont.truetype(FONT,max(16,int(w/29)))
 d.text((w*.05,h*.81),label,fill='#f2dfb5',font=f)
 d.text((w*.05,h*.91),'赛博书房 · 合成测试素材 / SYNTHETIC',fill='#a2bac4',font=ImageFont.truetype(FONT,max(12,int(w/55))))
 return im
def gps(v):
 a=abs(v); m=(a-int(a))*60; return ((int(a),1),(int(m),1),(round((m-int(m))*60*10000),10000))
def photo(rel,label,i,lat=None,lon=None,date=None,orientation=1,size=(1200,800)):
 p=path(rel); im=art(label,i,size); ex={'0th':{piexif.ImageIFD.Orientation:orientation},'Exif':{},'GPS':{}}
 if date:ex['Exif'][piexif.ExifIFD.DateTimeOriginal]=date.encode()
 if lat is not None:ex['GPS']={1:b'N' if lat>=0 else b'S',2:gps(lat),3:b'E' if lon>=0 else b'W',4:gps(lon)}
 im.save(p,exif=piexif.dump(ex)); record(p,'照片定位与时间', '确认前不进入正式足迹；读取可用 EXIF，缺失信息待确认',latitude=lat,longitude=lon,date=date,orientation=orientation);return p
cities=[('杭州',30.2741,120.1551),('上海',31.2304,121.4737),('京都',35.0116,135.7681),('巴黎',48.8566,2.3522),('纽约',40.7128,-74.006),('悉尼',-33.8688,151.2093),('开普敦',-33.9249,18.4241),('利马',-12.0464,-77.0428)]
for i,(name,lat,lon) in enumerate(cities):
 for j in range(3):photo(f'01_地球仪/正常照片/旅程{i//2+1}/{i*3+j+1:02d}_{name}.jpg',f'{name} · 记忆 {j+1}',i*3+j,lat+j*.0003,lon+j*.0003,f'2025:{i//2+3:02d}:{j+1:02d} 10:30:00')
photo('01_地球仪/边界照片/01_只有时间.jpg','只有拍摄时间',31,date='2025:03:01 10:00:00')
photo('01_地球仪/边界照片/02_只有坐标.jpg','只有坐标',32,30.2741,120.1551)
photo('01_地球仪/边界照片/03_均无元数据.jpg','请手动确认',33)
for i,(lat,lon,name) in enumerate([(0,0,'零经纬度'),(10,179.8,'日期线东'),(10,-179.8,'日期线西'),(89.9,0,'近北极'),(-89.9,0,'近南极'),(91,181,'越界坐标')]):photo(f'01_地球仪/边界照片/{name}.jpg',name,40+i,lat,lon,'2024:02:29 23:59:59')
photo('01_地球仪/边界照片/方向6_应旋转.jpg','方向测试 ↑',47,30,120,orientation=6,size=(800,1200))
photo('01_地球仪/边界照片/非法日期.jpg','非法日历日期',48,date='2025:13:40 25:61:61')
for ext in ['png','webp','heic']:
 p=path(f'01_地球仪/边界照片/无EXIF.{ext}');art(ext,50).save(p);record(p,'格式兼容','能解码则待确认；不能解码应单项失败')
p=path('01_地球仪/重复照片/改名但字节完全相同.jpg');shutil.copyfile(ROOT/'01_地球仪/正常照片/旅程1/01_杭州.jpg',p);record(p,'哈希重复','先导入正常照片后应跳过',duplicate_of='01_地球仪/正常照片/旅程1/01_杭州.jpg')
p=photo('01_地球仪/重复照片/同景重新编码.jpg','杭州 · 记忆 1',0,30.2741,120.1551,'2025:03:01 10:30:00');im=Image.open(p);ex=im.info['exif'];im.save(p,quality=65,exif=ex)
for i in range(300):
 name,lat,lon=cities[i%8];photo(f'08_批量压力/照片300/{i:04d}_{name}.jpg',f'{name} {i:04d}',i,lat+(i%7)*.001,lon+(i%11)*.001,f'2025:06:{i%28+1:02d} 12:00:00',size=(480,320))
# Original fictional research corpus, stable page locators and contrasting conclusions.
papers=[('P01','步行与延迟回忆','林禾','2024','安静步行组的延迟回忆均值为 8.2，静坐组为 6.1。','样本量 24；观察窗口只有七天。','P02,P03'),('P02','噪声环境中的城市漫步','周澄','2024','交通噪声条件下步行组均值为 5.9，静坐组为 6.0，未观察到改善。','样本量 20；噪声与路线难度同时变化。','P01,P04'),('P03','从路线线索到空间记忆','Lin He','2025','路线地标有助于位置回忆，但不能直接推出词语记忆改善。','样本量 32；任务指标与 P01 不同。','P01,P02'),('P04','注意力恢复与阅读节奏','周澄','2025','休息后阅读正确率由 71% 升至 78%，缺少随机分组。','样本量 18；仅可描述相关性。','P01,P05'),('P05','低强度音乐与复述','陈屿','2025','器乐条件复述得分为 7.0，静音条件为 7.1。','样本量 16；不支持音乐普遍提升记忆。','P04,P06'),('P06','旅行日记的回忆偏差','陈屿','2026','当天记录比一周后补记保留更多时间线索。','样本量 12；日记属于自我报告。','P01,P03')]
def paper_pages(pid,title,author,year,finding,limit,refs):
 return [[title,f'作者：{author}  年份：{year}  样例编号：{pid}','本文为原创虚构测试论文，不是真实研究，不可作为学术证据。','摘要',f'本研究围绕城市旅行、注意力与记忆建立可供跨文档检索的测试材料。{finding}',f'共同检索词：城市记忆；唯一定位词：ANCHOR-{pid}-ABSTRACT。','问题：不同环境下的休息方式是否影响回忆？'],['方法与结果',finding,limit,'表 1 为虚构测试数据；数值仅用于检索、表格提取和引用测试。','组别    人数    均值','A       12      8.2','B       12      6.1',f'唯一定位词：ANCHOR-{pid}-RESULT。','公式示例：difference = mean(A) - mean(B)。'],['讨论与参考文献',limit,'需要区分地点回忆、词语回忆与主观感受，不应将不同指标混为一个结论。',f'关联阅读：{refs}。它们分别提供支持、反例或不同测量方式。','引文定位：引用本页时应保持当前附件版本与页码。',f'唯一定位词：ANCHOR-{pid}-LIMIT。','参考文献均指向本样例包中的虚构论文，不包含真实 DOI。']]
def pdf(rel,pages):
 p=path(rel);c=canvas.Canvas(str(p),pagesize=(595,842));c.setTitle(pages[0][0]);c.setAuthor('赛博书房测试资料')
 for n,lines in enumerate(pages,1):
  c.setFont('STSong-Light',18);c.drawString(48,786,lines[0]);y=744;c.setFont('STSong-Light',12)
  for line in lines[1:]:
   for k in range(0,len(line),36):c.drawString(48,y,line[k:k+36]);y-=23
   y-=9
  c.setFont('STSong-Light',10);c.drawString(48,35,f'合成测试材料 | 第 {n} 页');c.showPage()
 c.save();record(p,'文字PDF阅读与跨文献引用','可提取文字；3页定位、选区批注和引用保持一致');return p
for row in papers:
 pid,title,author,year,finding,limit,refs=row;pages=paper_pages(*row)
 pdf(f'02_学术/全文/{pid}_{title}.pdf',pages)
 write(f'02_学术/笔记/{pid}_文献笔记.md',f'# {title} 文献笔记\n\n作者：{author}\n\n## 原文摘录\n> {finding}\n\n出处：{pid} 第2页 ANCHOR-{pid}-RESULT。\n\n## 我的判断\n{limit} 因此不能泛化到所有旅行与阅读场景。\n\n## 关联\n{refs}\n\n标签：城市记忆、方法限制\n')
# alternate version, duplicate, scan, mixed, encrypted
p=pdf('02_学术/版本与重复/P01_v2_扩大样本.pdf',paper_pages('P01-v2','步行与延迟回忆 修订版','林禾','2025','样本扩充到 48，均值差缩小为 0.4。','不能覆盖初版的摘录快照。','P01,P02'))
shutil.copyfile(ROOT/'02_学术/全文/P01_步行与延迟回忆.pdf',path('02_学术/版本与重复/P01_完全重复改名.pdf'))
scan=path('02_学术/扫描/OCR_中文英文_仅图像.pdf');c=canvas.Canvas(str(scan),pagesize=(595,842))
for n in range(2):
 im=Image.new('RGB',(1240,1754),'#f7f4eb');d=ImageDraw.Draw(im);f=ImageFont.truetype(FONT,32)
 lines=['扫描实验记录 / SCANNED TEST',f'第 {n+1} 页：城市记忆与注意力','合成材料，不是真实研究。','清晨步行二十分钟后，记录沿途三个地标。','样本量 n = 24；均值 8.2 与 6.1。',f'OCR-ANCHOR-{n+1}: Memory and attention.','0 O 1 l I；中文标点：，。；数字：2024。']
 for j,l in enumerate(lines):d.text((100,150+j*95),l,font=f,fill='#252525')
 from reportlab.lib.utils import ImageReader
 c.drawImage(ImageReader(im),0,0,595,842);c.showPage()
c.save();record(scan,'OCR按需触发','无文字层；OCR后应含 OCR-ANCHOR-1 和 n = 24')
w=PdfWriter();w.append(str(ROOT/'02_学术/全文/P01_步行与延迟回忆.pdf'));w.append(str(scan));p=path('02_学术/扫描/混合文字扫描.pdf');w.write(p);record(p,'混合PDF','5页，前三页有文字，后两页需要OCR')
w=PdfWriter();w.append(str(ROOT/'02_学术/全文/P02_噪声环境中的城市漫步.pdf'));w.encrypt('study-test-2026');p=path('09_异常样例/加密论文_密码study-test-2026.pdf');w.write(p);record(p,'加密文档','应提示密码或明确不支持，不能整批崩溃')
# Word corpus and authoring manuscript
for n in range(3):
 d=Document();d.add_heading(['步行与延迟回忆 Word 附件','旅行记忆综述写作稿','引文更新与格式保护稿'][n],0)
 d.add_paragraph('这是原创虚构测试文稿，用于文献导入、跨文档引用和写回副本测试。')
 for row in papers[:3]:
  d.add_heading(row[1],1);d.add_paragraph(row[4]);d.add_paragraph(f'待插入引用：{row[0]} 第2页。对照：{row[5]}')
 t=d.add_table(rows=1,cols=3);t.style='Table Grid'
 for c,v in zip(t.rows[0].cells,['研究','指标','限制']):c.text=v
 for row in papers[:3]:
  for c,v in zip(t.add_row().cells,[row[0],row[4],row[5]]):c.text=v
 d.add_paragraph('需保留的格式：').add_run('这一句是加粗文本。').bold=True
 d.add_paragraph('最后一段：引用 P01 与 P02，删除一个引用后更新参考文献列表。')
 d.styles['Normal'].font.name='PingFang SC';d.styles['Normal'].font.size=Pt(11)
 p=path(f'02_学术/Word/{n+1:02d}_'+['论文附件','写作项目','格式保护'][n]+'.docx');d.save(p);record(p,'Word导入与引用写回','在副本中插入、更新、删除引用；表格和加粗应保留','规划功能素材')
bib=[];ris=[];csl=[]
for pid,title,author,year,finding,limit,refs in papers:
 bib.append(f'@article{{{pid},\n title = {{{title}}},\n author = {{{author}}},\n year = {{{year}}},\n journal = {{合成城市记忆测试刊}},\n volume = {{1}},\n pages = {{1--3}},\n abstract = {{{finding}}}\n}}')
 ris.append(f'TY  - JOUR\nID  - {pid}\nTI  - {title}\nAU  - {author}\nPY  - {year}\nJO  - 合成城市记忆测试刊\nAB  - {finding}\nER  - \n')
 csl.append({'id':pid,'type':'article-journal','title':title,'author':[{'literal':author}],'issued':{'date-parts':[[int(year)]]},'container-title':'合成城市记忆测试刊','page':'1-3'})
for name,data in [('六篇关联论文.bib','\n\n'.join(bib)),('六篇关联论文.ris','\n'.join(ris))]:p=write('02_学术/题录/'+name,data);record(p,'题录与全文关联','6条虚构题录；用题名作者年份关联全文','规划功能素材')
js('02_学术/题录/六篇论文_CSL-JSON.json',csl)
js('02_学术/题录/Zotero模拟条目_非原生备份.json',[{'key':f'TEST000{i}','itemType':'journalArticle','title':r[1],'collections':['城市记忆'],'attachments':[f'../全文/{r[0]}_{r[1]}.pdf']} for i,r in enumerate(papers)])
write('02_学术/题录/重复与冲突.ris',ris[0]+'\n'+ris[0].replace('2024','2025').replace('林禾','林禾; 周澄')+'\nTY  - JOUR\nTI  - 缺失作者年份\nER  - \n')
# Books with chapters, rich markdown, variants and encodings
book_titles=['沿河慢行','雨声中的图书馆','城市记忆手册','注意力的四季','无声的专辑','夜航日记']
chapters=['出发与观察','地标与回忆','声音与阅读','反例与修正','归途与笔记','参考与回望']
def booktext(title,idx,long=False):
 out=f'# {title}\n\n作者：样例作者{idx+1}\n\n原创虚构测试读物。项目：城市记忆。\n\n'
 for j,ch in enumerate(chapters):
  out+=f'## 第{j+1}章 {ch}\n\n'
  for k in range(45 if long else 10):
   out+=f'第{j+1}章第{k+1}段。沿河慢行时，我把桥、书店和旧车站记在纸上。离开熟悉的环境让我重新注意道路的纹理，但主观放松不代表测量成绩一定提高。记录编号 B{idx+1:02d}-C{j+1}-P{k+1}。\n\n'
  out+='> 城市记忆依赖线索，也依赖后来如何讲述。\n\n'
  out+='- 地点：杭州\n- 主题：注意力\n- 任务：区分原文与判断\n\n'
  out+='| 线索 | 记录 |\n| --- | --- |\n| 桥 | 路线位置 |\n| 雨声 | 主观感受 |\n\n'
 return out
for i,title in enumerate(book_titles):
 txt=booktext(title,i);p=write(f'03_电子书/正常/{i+1:02d}_{title}.md',txt);record(p,'章节阅读划线批注','6章，唯一段落编号可验证进度、回跳和跨书检索')
# valid EPUB 3, distinct publication IDs, embedded cover, nav and chapter links
for i,title in enumerate(book_titles[:3]):
 p=path(f'03_电子书/EPUB/{title}.epub');cover=io.BytesIO();art(title,i,size=(600,900)).save(cover,format='JPEG')
 with zipfile.ZipFile(p,'w',zipfile.ZIP_DEFLATED) as z:
  z.writestr('mimetype','application/epub+zip',compress_type=zipfile.ZIP_STORED)
  z.writestr('META-INF/container.xml','<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
  items=''.join(f'<item id="c{k}" href="c{k}.xhtml" media-type="application/xhtml+xml"/>' for k in range(6));spine=''.join(f'<itemref idref="c{k}"/>' for k in range(6))
  z.writestr('OEBPS/package.opf',f'<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:cyber-study:book:{i}</dc:identifier><dc:title>{title}</dc:title><dc:creator>样例作者{i+1}</dc:creator><dc:language>zh-CN</dc:language><meta property="dcterms:modified">2026-11-14T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="cover" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>{items}</manifest><spine>{spine}</spine></package>')
  z.writestr('OEBPS/cover.jpg',cover.getvalue())
  z.writestr('OEBPS/nav.xhtml','<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><ol>'+''.join(f'<li><a href="c{k}.xhtml">{ch}</a></li>' for k,ch in enumerate(chapters))+'</ol></nav></body></html>')
  for k,ch in enumerate(chapters):
   paras=''.join(f'<p id="p{n}">B{i+1:02d}-C{k+1}-P{n}：城市记忆依赖路线线索。主观感受不能替代对照实验。第{n}次经过桥边，我记录了雨声与光线。</p>' for n in range(1,35))
   z.writestr(f'OEBPS/c{k}.xhtml',f'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>{ch}</title></head><body><h1>{ch}</h1>{paras}<a href="c0.xhtml#p1">回到起点</a></body></html>')
 record(p,'EPUB目录重排与定位','6章可跳转；字体重排后定位与划线保持','规划功能素材')
for enc in ['utf-8-sig','utf-16','gb18030']:
 p=write(f'03_电子书/编码/中文_{enc}.txt',booktext('编码与标点测试',7).encode(enc));record(p,'中文编码','中文可读，标题作者正确，不乱码',encoding=enc)
p=write('03_电子书/长篇/六章长篇.md',booktext('长篇阅读定位测试',8,True));record(p,'长文进度恢复','记录末章唯一编号；重启后应回到原位置')
shutil.copyfile(ROOT/'03_电子书/正常/01_沿河慢行.md',path('03_电子书/重复与版本/沿河慢行_完全相同.md'))
write('03_电子书/重复与版本/沿河慢行_修订版.md',booktext('沿河慢行',0).replace('桥、书店和旧车站','桥、博物馆和新车站'))
for i in range(120):write(f'08_批量压力/书籍120/{i:03d}_书架分页.md',f'# 城市片段 {i:03d}\n\n作者：测试作者{i%12}\n\n城市记忆。唯一键 BULK-BOOK-{i:03d}。\n\n'+('用于分页、筛选和持久化。\n\n'*20))
# Real decodable original audio in nine formats
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
formats={'mp3':'libmp3lame','wav':'pcm_s16le','flac':'flac','aac':'aac','m4a':'aac','ogg':'libvorbis','oga':'libvorbis','opus':'libopus','webm':'libopus'}
for i,(ext,codec) in enumerate(formats.items()):
 p=path(f'04_音乐/正常/城市回声/{i+1:02d}_雨后步行.{ext}');cmd=[ffmpeg,'-v','error','-y','-f','lavfi','-i',f'sine=frequency={220+i*27}:duration={8+i}:sample_rate=48000','-af','volume=0.12,afade=t=in:d=0.3,afade=t=out:st='+str(7+i)+':d=1','-c:a',codec,'-metadata',f'title=雨后步行 {i+1}','-metadata','artist=合成声景实验室','-metadata','album=城市回声','-metadata','date=2025','-metadata',f'track={i+1}',str(p)]
 subprocess.run(cmd,check=True);record(p,'音频解码标签专辑归组','可播放，淡入淡出；同专辑9曲；标签支持程度依格式而异',duration=8+i,codec=codec)
# Embed cover in MP3 and FLAC
from mutagen.id3 import ID3,APIC
from mutagen.flac import FLAC,Picture
cover=io.BytesIO();art('城市回声',66,(600,600)).save(cover,format='JPEG')
a=ID3(ROOT/'04_音乐/正常/城市回声/01_雨后步行.mp3');a.add(APIC(mime='image/jpeg',type=3,desc='Cover',data=cover.getvalue()));a.save()
a=FLAC(ROOT/'04_音乐/正常/城市回声/03_雨后步行.flac');pic=Picture();pic.type=3;pic.mime='image/jpeg';pic.data=cover.getvalue();a.add_picture(pic);a.save()
for i,name in enumerate(['无标签','雨后步行 Live','雨后步行 翻奏','超长名称_城市雨夜中的缓慢漫步与回忆'*3]):
 p=path(f'04_音乐/边界/{name}.wav');subprocess.run([ffmpeg,'-v','error','-y','-f','lavfi','-i',f'sine=frequency={300+i*50}:duration=5','-af','volume=0.1',str(p)],check=True);record(p,'缺失标签与版本歧义','能播放；无标签待确认；Live与翻奏不可盲目合并')
shutil.copyfile(ROOT/'04_音乐/正常/城市回声/01_雨后步行.mp3',path('04_音乐/重复/改名重复.mp3'))
for i in range(60):
 p=path(f'08_批量压力/音频60/专辑{i//3:02d}/{i:03d}.wav')
 with wave.open(str(p),'wb') as w:w.setparams((1,2,8000,0,'NONE','not compressed'));w.writeframes(b''.join(struct.pack('<h',int(1200*math.sin(2*math.pi*(200+i)*t/8000))) for t in range(8000)))
# Fictional movies, manual import worksheet, no false online identity
movies=[]
for i in range(30):
 title=['归途','归途','雨夜书店','桥上的星期天','无声地图','记忆回声'][i%6];poster=path(f'05_电影/海报/M{i+1:02d}_{title}.jpg');art(title,i,(600,900)).save(poster)
 movies.append(dict(id=f'M{i+1:02d}',title=title,year=1996+i,region=['中国 / 法国','日本','美国'][i%3],genres=['剧情','纪录片','科幻'][i%3],personalRating=i%5+1,publicRating=round(6+i%4*.7,1),status='wish' if i in [4,9,14] else 'watched',watchedAt=f'2025-{i%12+1:02d}-15',tags=['城市记忆','旅行'],shortComment='路线成为叙事线索，主观回忆可能被后来重写。',review=f'{title}的第十二分钟，主角在桥边停下。这让我联想到 P03 的地标线索；它只是观影联想，不能被当作实验结果。',poster=str(poster.relative_to(ROOT)),source='synthetic',externalId=None))
js('05_电影/手工录入与未来适配/电影30条_非豆瓣官方导出.json',movies)
with path('05_电影/手工录入与未来适配/电影30条.csv').open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(movies[0]));w.writeheader();w.writerows(movies)
write('05_电影/手工录入与未来适配/观影感想.md','\n\n'.join(f"# {m['id']} {m['title']} ({m['year']})\n\n{m['review']}\n\n个人星级：{m['personalRating']}；公共评分：{m['publicRating']}。" for m in movies))
# Integrated knowledge and privacy golden dataset
notes=[]
for i,row in enumerate(papers):notes.append(dict(id=f'N{i+1:02d}',sourceId=row[0],sourceType='academic',locator={'page':2,'anchor':f'ANCHOR-{row[0]}-RESULT'},snapshot=row[4],body=row[5],tags=['城市记忆','注意力'],project='城市旅行与记忆',privacy='public',aiAllowed=True))
for i in range(12):
 text=f'2025年3月{i+1}日。今天在杭州沿河慢行，雨声让我感到放松。主观感受不是对照实验。私密标记 DIARY-PRIVATE-{i:02d}。这只是虚构日记。'
 p=write(f'06_日记便签/日记/D{i+1:02d}.txt',text);record(p,'日记本地检索与AI授权','手工录入；默认可本地搜索、不可发给AI','手工录入')
 notes.append(dict(id=f'D{i+1:02d}',sourceId=f'D{i+1:02d}',sourceType='diary',locator={'date':f'2025-03-{i+1:02d}'},snapshot=text,body='私人回忆，默认不发送',tags=['城市记忆'],project='城市旅行与记忆',privacy='private',aiAllowed=False))
for i,typ in enumerate(['book','movie','music']):notes.append(dict(id=f'N{7+i:02d}',sourceId=['B01','M01','A01'][i],sourceType=typ,locator=[{'chapter':2,'paragraph':1},{'time':'00:12:00'},{'time':'00:00:03'}][i],snapshot=['城市记忆依赖线索，也依赖后来如何讲述。',movies[0]['review'],'雨后步行的低音让我回想起桥边的停顿。'][i],body='这是个人理解；不能替代论文中的测量结果。',tags=['城市记忆'],project='城市旅行与记忆',privacy='public',aiAllowed=True))
js('07_知识库/关联记录_契约样例非应用备份.json',{'fixtureSchema':'cyber-study-fixtures/1','notes':notes,'relations':[{'from':'N01','to':'N02','type':'contradicts'},{'from':'N01','to':'N03','type':'different-outcome'}]})
write('07_知识库/综合笔记_期望导出.md','# 城市旅行是否改善记忆\n\nP01 在安静条件下报告更高回忆均值，但 P02 的噪声条件没有观察到改善；P03 测量的是地点回忆，不能直接合并。[^1][^2][^3]\n\n我的判断：条件和指标不同，当前材料不足以支持普遍因果结论。书籍与观影记录仅作为个人联想。\n\n项目：城市旅行与记忆\n标签：城市记忆、证据限制\nAI辅助：否\n\n[^1]: P01《步行与延迟回忆》，第2页，安静步行组 8.2，静坐组 6.1。\n[^2]: P02《噪声环境中的城市漫步》，第2页，5.9 与 6.0。\n[^3]: P03《从路线线索到空间记忆》，第2页，指标为位置回忆。\n')
js('07_知识库/检索与AI标准答案.json',[{'query':'城市记忆','expected':['N01','N02','N03','N04','N05','N06','N07','N08','N09'],'excludedFromAI':[f'D{i+1:02d}' for i in range(12)]},{'query':'步行一定能改善记忆吗','mustCite':['P01','P02','P03'],'mustMention':['环境条件不同','测量指标不同','不能普遍推广']},{'query':'哪篇研究证明效果持续十年','expected':'证据不足，不编造引文'},{'query':'DIARY-PRIVATE-00','localHit':'D01','aiDefaultHit':False}])
write('06_日记便签/便签待办与打字机.txt','便签：比较 P01 与 P02 的研究条件。\n待办1：阅读沿河慢行第2章。\n待办2：确认杭州照片地点。\n待办3：整理电影归途的观影感想。\n长便签：'+('请保持换行和中文标点。'*100)+'\n\n打字机必须实际键入，当前禁止粘贴：\n学而时习之，不亦说乎？有朋自远方来，不亦乐乎？\n先输入错误字符，再修改；保存半篇草稿，重启继续，完成后分别送到日记和便签。')
# Explicit negative files, harmless text only
for rel,data,expect in [('损坏图片.jpg',b'not a JPEG','拒绝解码'),('零字节.png',b'','拒绝空文件'),('损坏论文.pdf',b'%PDF-1.7\ntruncated','解析失败'),('空正文.txt',b' \n\t','没有正文'),('假EPUB.epub',b'not zip','格式错误'),('损坏音频.mp3',b'not audio','无法播放但不中断其他曲目'),('错误题录.bib',b'@article{broken, title={','题录解析错误'),('错误JSON.json',b'{broken','明确报错')]:
 p=write('09_异常样例/'+rel,data);record(p,'异常输入',expect)
# Platform responses are our own neutral contract, not official API schemas
for provider in ['QQ音乐','网易云音乐','微信读书','豆瓣已读','豆瓣已看']:
 js(f'10_接口模拟/{provider}_首次.json',{'fixtureSchema':'neutral-adapter-v1','provider':provider,'items':[{'id':'TEST-001','title':'城市回声','version':'studio','rating':5},{'id':'TEST-002','title':'归途','version':'1996','rating':3}],'note':'仅供未来适配器映射，不是官方响应或可直接导入的文件'})
 js(f'10_接口模拟/{provider}_再次同步.json',{'fixtureSchema':'neutral-adapter-v1','items':[{'id':'TEST-001','title':'城市回声','version':'studio','rating':4},{'id':'TEST-003','title':'沿河慢行','rating':5}],'expected':'新增003，更新001，保留本地002及人工笔记'})
for code in [401,403,429,500]:js(f'10_接口模拟/HTTP_{code}.json',{'status':code,'error':{'message':f'Synthetic failure {code}'},'expected':'保留已有资料，可重试；不写入成功状态'})
# Capture every explicit acceptance criterion without claiming execution
mapping={'地球仪':('G','01_地球仪','地球仪正常照片批量导入→确认→编辑→旅程/回收站/备份'),'学术':('A','02_学术','导入六篇论文与题录→摘录P01/P02→写作项目→引用→副本导出'),'电子书':('B','03_电子书','导入正常书籍→划线批注→切换书籍→关闭重开→回跳'),'电影':('F','05_电影','手工录入M01至M06→上传海报→感想→筛选与重开'),'音乐':('M','04_音乐','导入正常音频文件夹→播放/切换/循环→重开→缺失文件'),'个人知识':('K','07_知识库','建立P01/P02及跨媒体笔记→检索→检查来源→导出')}
rows=[]
for source in sorted((REPO/'开发文档/01_需求与设计').glob('*.md')):
 key=next(k for k in mapping if k in source.name);prefix,folder,steps=mapping[key];section=''
 for n,line in enumerate(source.read_text().splitlines(),1):
  if line.startswith('#'):section=line.lstrip('# ')
  if line.startswith('- [ ]'):
   rows.append({'用例ID':f'{prefix}-{sum(x["用例ID"].startswith(prefix+"-") for x in rows)+1:03d}','需求文档':source.name,'行号':n,'章节':section,'验收要求':line[6:].strip(),'素材目录':folder,'准备步骤':steps,'判断标准':line[6:].strip(),'执行状态':'未执行','补充说明':'结合 00_测试路线.md；界面、外部授权和故障注入需实际运行验证'})
with path('00_逐条需求验收矩阵.csv').open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
# Include all files in hash inventory, with richer metadata for constructed edge cases
known={r['path']:r for r in manifest}
for p in sorted(ROOT.rglob('*')):
 if not p.is_file() or '工具' in p.parts or p.name in ['样例清单.json','校验报告.json']:continue
 rel=str(p.relative_to(ROOT));r=known.get(rel,dict(path=rel,case='配套素材',expected='见测试路线与模块说明',mode='按说明使用'));r.update(size=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest());known[rel]=r
js('样例清单.json',{'schemaVersion':1,'synthetic':True,'acceptanceCriteria':len(rows),'files':list(known.values())})
print(json.dumps({'files':len(known),'acceptanceCriteria':len(rows),'root':str(ROOT)},ensure_ascii=False))
