import sys,csv,hashlib
raw,out,n,tag,mode=sys.argv[1],sys.argv[2],int(sys.argv[3]),sys.argv[4],sys.argv[5]
data=open(raw,'rb').read().decode('utf-8','replace')
rows=data.split('~#~\n')
if rows and rows[-1]=='': rows.pop()
seen=set()
with open(out,'w',newline='') as f:
    w=csv.writer(f)
    for r in rows:
        fs=r.split('~^~')
        if len(fs)!=n: raise SystemExit(f'{raw}: row has {len(fs)} fields, expected {n}: {r[:120]!r}')
        vals=['\\N' if v=='' else ('' if v=='\x00' else v) for v in fs]
        extra=['{'+tag+'}']
        if mode=='hash':
            h=hashlib.md5('\x1f'.join(fs).encode()).hexdigest()
            if h in seen: continue
            seen.add(h); extra.append(h)
        w.writerow(vals+extra)
