import sys
from PIL import Image, ImageDraw
REF=__import__('os').environ.get('REF','')
ref=Image.open(REF).convert('RGB')
cur=Image.open(sys.argv[1]).convert('RGB')
if cur.size!=ref.size: cur=cur.resize(ref.size)
def pair(name, box, zoom=None, stack='v'):
    a=ref.crop(box); b=cur.crop(box); w,h=a.size
    z = zoom or min(2.4, 1150/w if stack=='v' else 560/w)
    if stack=='v':
        out=Image.new('RGB',(w,h*2+6),(255,0,255)); out.paste(a,(0,0)); out.paste(b,(0,h+6))
        out=out.resize((int(w*z),int((h*2+6)*z)))
    else:
        out=Image.new('RGB',(w*2+6,h),(255,0,255)); out.paste(a,(0,0)); out.paste(b,(w+6,0))
        out=out.resize((int((w*2+6)*z),int(h*z)))
    out.save(name)
