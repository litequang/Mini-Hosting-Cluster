#!/usr/bin/env python3
"""Portable LAB archive: no credentials, users, symlinks, plugins, or arbitrary paths."""
import hashlib, json, os, pathlib, sys, tarfile, io
mode, site, archive, content = sys.argv[1:]
site=pathlib.Path(site);archive=pathlib.Path(archive)
def allowed(name):
 p=pathlib.PurePosixPath(name)
 if name!=str(p) or p.is_absolute() or '..' in p.parts or '\\' in name:return False
 if name=='content.json':return True
 if not name.startswith('site/'):return False
 rel=name[5:];parts=pathlib.PurePosixPath(rel).parts
 if any(v.startswith('.') or v in ('wp-config.php','wp-config-sample.php','php.ini','user.ini') or v.lower().endswith(('.env','.cnf','.sql','.pem','.key')) for v in parts):return False
 if parts[0]=='wp-content':return rel.startswith('wp-content/themes/p33lab/') or rel.startswith('wp-content/uploads/p33/')
 return parts[0] in ('wp-admin','wp-includes') or len(parts)==1 and (rel.endswith('.php') or rel in ('license.txt','readme.html','robots.txt'))
def digest(b):return hashlib.sha256(b).hexdigest()
if mode=='pack':
 files=[]
 for p in site.rglob('*'):
  name='site/'+p.relative_to(site).as_posix()
  if p.is_symlink():raise RuntimeError('SITE_ARCHIVE_SYMLINK_DENIED')
  if p.is_file() and allowed(name):files.append((name,p))
 files.append(('content.json',pathlib.Path(content)))
 manifest={'schema':1,'siteId':'mhc-p33-wordpress-v1','credentialsIncluded':False,'files':[]};total=0
 with tarfile.open(archive,'w:gz',compresslevel=6) as out:
  for name,p in sorted(files):
   b=p.read_bytes();total+=len(b)
   if len(b)>16*1024*1024 or total>256*1024*1024:raise RuntimeError('SITE_ARCHIVE_TOO_LARGE')
   manifest['files'].append({'path':name,'bytes':len(b),'sha256':digest(b)})
   info=tarfile.TarInfo(name);info.size=len(b);info.mode=0o600;out.addfile(info,io.BytesIO(b))
  b=json.dumps(manifest,separators=(',',':')).encode();info=tarfile.TarInfo('manifest.json');info.size=len(b);info.mode=0o600;out.addfile(info,io.BytesIO(b))
 os.chmod(archive,0o600);print(json.dumps({'manifestSha256':digest(b),'files':len(files)}))
elif mode=='unpack':
 # Verify the complete archive before creating any destination file; never tar.extract on input.
 with tarfile.open(archive,'r:gz') as inp:
  members=inp.getmembers()
  if len(members)>12000 or any(not m.isfile() or not(allowed(m.name) or m.name=='manifest.json') or m.size>16*1024*1024 for m in members) or sum(m.size for m in members)>256*1024*1024:raise RuntimeError('SITE_ARCHIVE_PATH_OR_SIZE_DENIED')
  names=[m.name for m in members]
  if len(set(names))!=len(names) or names.count('manifest.json')!=1:raise RuntimeError('SITE_ARCHIVE_DUPLICATE')
  raw=inp.extractfile('manifest.json').read();manifest=json.loads(raw)
  if manifest.get('schema')!=1 or manifest.get('credentialsIncluded') is not False or manifest.get('siteId')!='mhc-p33-wordpress-v1':raise RuntimeError('SITE_ARCHIVE_MANIFEST_INVALID')
  entries={v['path']:v for v in manifest['files']}
  if set(names)-{'manifest.json'}!=set(entries) or len(entries)!=len(manifest['files']):raise RuntimeError('SITE_ARCHIVE_MANIFEST_INVALID')
  for m in members:
   if m.name=='manifest.json':continue
   b=inp.extractfile(m).read();e=entries[m.name]
   if len(b)!=e['bytes'] or digest(b)!=e['sha256']:raise RuntimeError('SITE_ARCHIVE_CHECKSUM_MISMATCH')
  for m in members:
   if m.name=='manifest.json':continue
   p=pathlib.Path(content) if m.name=='content.json' else site/m.name[5:]
   p.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
   if p.is_symlink():raise RuntimeError('SITE_ARCHIVE_DESTINATION_EXISTS')
   if p.exists():
    if not p.is_file() or digest(p.read_bytes())!=entries[m.name]['sha256']:raise RuntimeError('SITE_ARCHIVE_DESTINATION_EXISTS')
    continue
   with p.open('xb') as f:f.write(inp.extractfile(m).read())
   p.chmod(0o600)
  print(json.dumps({'manifestSha256':digest(raw),'files':len(entries)}))
else:raise RuntimeError('SITE_ARCHIVE_USAGE')
