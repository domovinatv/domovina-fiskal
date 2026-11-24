# Upiše tablične znamenke (OpenType 'tnum') izravno u cmap, tako da je 0–9
# jednake širine bez ikakve layout značajke (pdf-lib ih ne mjeri ispravno).
#   python3 -I scripts/fontovi-tnum.py <ulaz.ttf> <izlaz.ttf>
import sys
from fontTools.ttLib import TTFont

f = TTFont(sys.argv[1])
gsub = f['GSUB'].table
mapa = {}
for fr in gsub.FeatureList.FeatureRecord:
    if fr.FeatureTag != 'tnum':
        continue
    for li in fr.Feature.LookupListIndex:
        for st in gsub.LookupList.Lookup[li].SubTable:
            st = getattr(st, 'ExtSubTable', st)
            mapa.update(getattr(st, 'mapping', {}) or {})
promijenjeno = 0
for t in f['cmap'].tables:
    for kod in range(0x30, 0x3A):
        g = t.cmap.get(kod)
        if g in mapa:
            t.cmap[kod] = mapa[g]
            promijenjeno += 1
if not promijenjeno:
    sys.exit('tnum mapiranje nije nađeno')
f.save(sys.argv[2])
print(f'{sys.argv[2]}: {promijenjeno} cmap unosa → tnum')
