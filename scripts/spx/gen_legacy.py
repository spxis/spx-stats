import csv,sys,collections,re
cols=collections.OrderedDict()
for r in csv.reader(open(sys.argv[1]),delimiter='\t'):
    if len(r)<8 or not r[0].strip(): continue
    t,c,dt,p,s,nul,pos,pk=[x.strip() for x in r]
    cols.setdefault(t,[]).append((c,dt,int(p),int(s),nul,int(pk)))
def pgtype(dt,p,s):
    return {'int':'integer','smallint':'smallint','tinyint':'smallint','bigint':'bigint','bit':'boolean',
     'datetime':'timestamp','smalldatetime':'timestamp','float':'double precision','real':'real'}.get(dt) or \
     (f'numeric({p},{s})' if dt in('decimal','numeric') else 'text')
def snake(n): return re.sub(r'(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])','_',n).lower()
out=['create schema if not exists legacy_spx;',
"comment on schema legacy_spx is 'The sports tables of the SPX (SportsInteractive.com) SQL Server database, 1997-2012, exactly as kept. Member data is not here.';"]
meta=[]
for t,cs in cols.items():
    cs=[c for c in cs if c[0]!='LastChangedPersonID']
    tn=snake(t)
    lines=[f'  "{snake(c)}" {pgtype(dt,p,s)}' for c,dt,p,s,nul,pk in cs]
    pks=['"'+snake(c)+'"' for c,dt,p,s,nul,pk in sorted([c for c in cs if c[5]>0],key=lambda x:x[5])]
    lines.append("  _seen_in text[] not null")
    if pks: lines.append(f"  primary key ({', '.join(pks)})")
    else:
        lines.append("  _row_hash text not null unique")
    out.append(f'create table legacy_spx.{tn} (\n'+',\n'.join(lines)+'\n);')
    out.append(f"comment on table legacy_spx.{tn} is 'SPX {t}';")
    meta.append((t,tn,'|'.join(c[0] for c in cs),'|'.join(snake(c[0]) for c in cs),'|'.join(pks)))
open(sys.argv[2],'w').write('\n'.join(out)+'\n')
with open(sys.argv[3],'w') as f:
    for m in meta: f.write('\t'.join(m)+'\n')
print(len(meta),'tables')
