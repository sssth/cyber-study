from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
R=Path(__file__).resolve().parents[1];p=R/'02_学术/全文版式_双栏图表.pdf'
pdfmetrics.registerFont(TTFont('CJK','/System/Library/Fonts/Supplemental/Arial Unicode.ttf'))
c=canvas.Canvas(str(p),pagesize=(595,842));c.setFont('CJK',18);c.drawString(40,790,'双栏排版与区域批注测试')
for x,tag in [(40,'LEFT'),(315,'RIGHT')]:
 c.setFont('CJK',11)
 for i in range(15):c.drawString(x,745-i*23,f'{tag}-{i+1:02d} 城市记忆与路线线索。')
c.setFont('CJK',12);c.drawString(40,350,'图1 虚构对照值，供区域框选测试')
c.setFillColorRGB(.2,.5,.6);c.rect(80,160,80,140,fill=1);c.rect(220,160,80,100,fill=1);c.setFillColorRGB(0,0,0)
c.drawString(80,140,'A 8.2');c.drawString(220,140,'B 6.1');c.drawString(40,70,'脚注1：合成数据，不能作为研究证据。');c.showPage()
c.setPageSize((842,595));c.setFont('CJK',18);c.drawString(40,540,'横向页面与图表回跳')
c.setFont('CJK',12)
for i in range(10):c.drawString(40,490-i*32,f'LANDSCAPE-{i+1:02d} 区域坐标应以当前页面尺寸为准。')
c.showPage();c.save()
