from pathlib import Path
from docx import Document
from docx.shared import RGBColor
from docx.oxml.ns import qn
R=Path(__file__).resolve().parents[1]
for p in (R/'02_学术/Word').glob('*.docx'):
 d=Document(p)
 for s in d.styles:
  if s.type==1:
   s.font.name='Arial Unicode MS';s.font.color.rgb=RGBColor(0,0,0)
   r=s.element.get_or_add_rPr();fonts=r.find(qn('w:rFonts'))
   if fonts is not None:
    for k in ['ascii','hAnsi','eastAsia','cs']:fonts.set(qn('w:'+k),'Arial Unicode MS')
    for k in list(fonts.attrib):
     if 'Theme' in k:del fonts.attrib[k]
 for tree in [d.element,d.styles.element]:
  for el in list(tree.iter(qn('w:pBdr'))):el.getparent().remove(el)
 d.save(p)
