import os
HERE=os.path.dirname(os.path.abspath(__file__))
import json,re
L=json.load(open(os.path.join(HERE,'library.json')))
KEYS={
'3m-superfit':["superfit","super fit"],'3m-classic-platinum':["classic platinum","310 4002"],'3m-classic':["e a r classic","ear classic"],
'3m-fx':["earsoft fx","e a rsoft fx","soft fx"],'3m-yellow-neons':["yellow neons","yellow neon"],'3m-taperfit2':["taperfit","taper fit"],
'3m-skull-screws':["skull screws","skullscrews","p1301"],'3m-h505b':["h505b"],'3m-x4p3':["x4p3"],'3m-h520b':["h520b"],'3m-h520f':["h520f"],'3m-h540p3':["h540"],
'3m-worktunes':["worktunes"],'3m-proprotect':["pro protect"],'hl-maxlite':["max lite","maxlite","lpf 1","lpf1"],'hl-max':["max 1","max1","maximum"],
'hl-laserlite':["laser lite","laserlite"],'hl-qb2hyg':["qb2"],'hl-vs120':["vs120","vs 120"],'hl-vs120n':["vs120n","vs 120n"],'hl-vs110':["vs110","vs 110"],
'hl-vs110-multi':["vs110 dielectric","vs 110 dielectric"],'hl-vs130':["vs130","vs 130"],'hl-c1h':["clarity c1h","c1h"],'hl-t2h':["thunder t2h","t2h"],'hl-v3':["viking v3"],
'hl-xtreme':["x treme"],'moldex-6604':["sparkplugs","spark plugs","6604"],'moldex-rockets':["rockets"],'moldex-parafit':["parafit","para fit"],'moldex-purafit':["purafit","pura fit","6800"],
'wurth-x100':["x 100","x100"],'wurth-x300':["x 300","x300"],'wurth-wj32':["wj32","wj 32"],'pc-probell':["probell","pro bell","epyc","epyu"],'pc-probullet':["probullet","epou"],
'pc-python':["python","empyts"],'pc-viper':["viper","emvip"],'uvex-xfit':["x fit","xfit"],'uvex-whisper':["whisper"],'wirra-emhb33':["emhb33"],'wirra-uncorded':[],
'force360-hwrx970':["hwrx970","hwrx 970"],'force360-base1':["force360 base","force 360 base"],'prosafe-torpedo':["torpedo","rep301"],'maxisafe-maxiplug':["maxiplug","heu645"],
'maxisafe-helmet':[],'wsp-premium':["workforce safety"],'wsp-standard':["workforce safety"],'wsp-uncorded':["workforce safety"],'blue-rapta':["rapta"],'bullant-aba840':["bullant","aba840"],
'ysf-h003c':["h003c"],'wa-custom':[],'procase-nnr28':["nnr"]}
MAKES={'3M':["3m","peltor","e a r"],'Honeywell Howard Leight':["howard leight","honeywell"],'Moldex':["moldex"],'Würth':["wurth","würth"],'Uvex':["uvex"],'ProChoice':["prochoice","pro choice"],'Force360':["force360","force 360"],'Prosafe':["prosafe"],'Maxisafe':["maxisafe"],'Blue Rapta':["blue rapta"],'Bullant':["bullant"],'Wirra':["wirra"],'WA Custom':["custom"],'ProCase':["procase"],'YSF':["ysf"],'Workforce Safety Products (WSP)':["workforce safety","wsp"]}
VARIANT_REPORT={'3m-h540p3'}  # manufacturer value is for a different variant: keep report value
P=[]
for i,o in enumerate(L):
    m=o['mfr']
    use_m = bool(m) and o['key'] not in VARIANT_REPORT
    slc = m[0] if use_m else o['mode']
    cls = m[1] if use_m else max(set(o['cls']),key=lambda c:o['cls'][c]) if False else (m[1] if use_m else int(sorted(o['cls'],key=lambda c:-o['cls'][c])[0]))
    # class must match band of the value used
    band=1 if slc<=13 else 2 if slc<=17 else 3 if slc<=21 else 4 if slc<=25 else 5
    cls=band
    basis='mfr' if use_m else 'report'
    flags=[f for f in o['flags'] if not f.startswith('no manufacturer')]
    vals=sorted(int(v) for v in o['vals'])
    bits=[]
    if len(vals)>1: bits.append('ENVSS reports have used '+' and '.join(map(str,vals))+' dB for this product')
    elif m and vals and vals[0]!=m[0]: bits.append('ENVSS reports used '+str(vals[0])+' dB')
    if m and (len(vals)>1 or (vals and vals[0]!=m[0])): bits.append('manufacturer says '+str(m[0])+' dB'+(' ('+m[4]+')' if m[4] and o['key'] not in VARIANT_REPORT else ''))
    if any('mismatch' in f for f in flags): bits.append('a past report gave it the wrong class')
    if o['key'] in VARIANT_REPORT: bits.append('manufacturer figure is for a different model variant, so the report value is used')
    elif m and m[4] and not (len(vals)>1 or (vals and vals[0]!=m[0])): bits.append(m[4])
    if not m and bits: bits.append('no manufacturer value found yet')
    why_txt='; '.join(bits)
    P.append(dict(id='HPD-%03d'%(i+1),k=o['key'],make=o['make'],model=o['model'],type=o['type'].lower(),cls=cls,slc=slc,basis=basis,
      check=bool(flags) or not use_m or bool(why_txt), why=(why_txt[0].upper()+why_txt[1:]+'.' if why_txt else ('' if use_m else 'No manufacturer value found yet: confirm on the box.')),
      src=(m[2] if m else ''),keys=KEYS.get(o['key'],[]),reports=len(o['jobs'])))
js='/* ENVSS HPD library (generated from the "ENVSS HPD Library (DRAFT 2026-11-28)" Sheet; do not edit by hand).\n   Sources: ENVSS HYG noise reports since Nov 2025 and manufacturer/distributor pages (see the Sheet for the link per row).\n   basis "mfr" = manufacturer value; "report" = most common value in ENVSS reports (unverified). check = values disagree or unverified: show a warning.\n   Class and SLC80 are numbers from the products\' public ratings (AS/NZS 1270 test data); nothing here is copied from the standard. */\n'
js+='window.ENVSS_HPD_LIB = '+json.dumps(dict(version='2026-11-28',count=len(P),makes=MAKES,products=P),ensure_ascii=False,separators=(',',':'))+';\n'
open(os.path.join(HERE,'..','..','..','hpd-library.js'),'w').write(js)
print(len(P),len(js))
