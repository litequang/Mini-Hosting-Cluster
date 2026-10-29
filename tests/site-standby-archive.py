import subprocess,sys,tempfile,pathlib,json,tarfile,io,hashlib
script=sys.argv[1]
def run(*args,ok=True):
 r=subprocess.run([sys.executable,script,*map(str,args)],capture_output=True,text=True)
 assert (r.returncode==0)==ok,(r.stdout,r.stderr)
 return json.loads(r.stdout) if ok else None
with tempfile.TemporaryDirectory() as temp:
 d=pathlib.Path(temp);site=d/'source';site.mkdir();(site/'index.php').write_text('<?php echo "LAB";');(site/'wp-config.php').write_text('NEVER_COPY_THIS_CREDENTIAL');(site/'.env').write_text('NEVER_COPY_ENV');(site/'wp-content/uploads/p33').mkdir(parents=True);(site/'wp-content/uploads/p33/lab.txt').write_text('media');content=d/'content.json';content.write_text('{"schema":1}');archive=d/'backup.tar.gz'
 packed=run('pack',site,archive,content)
 with tarfile.open(archive) as t:
  assert 'site/wp-config.php' not in t.getnames() and 'site/.env' not in t.getnames()
  assert all(b'NEVER_COPY' not in t.extractfile(m).read() for m in t.getmembers())
 target=d/'restore';out=d/'restored-content.json';unpacked=run('unpack',target,archive,out);assert packed['manifestSha256']==unpacked['manifestSha256'];assert(target/'index.php').read_bytes()==(site/'index.php').read_bytes();run('unpack',target,archive,out) # interrupted extraction / retry preserves exact bytes
 (target/'index.php').write_text('keep existing data');run('unpack',target,archive,out,ok=False);assert(target/'index.php').read_text()=='keep existing data'
 for name,kind in [('../escape','file'),('site/wp-config.php','file'),('site/link','link')]:
  bad=d/'bad.tar.gz'
  with tarfile.open(bad,'w:gz') as t:
   m=tarfile.TarInfo(name);m.size=1
   if kind=='link':m.type=tarfile.SYMTYPE;m.linkname='/tmp/escape';m.size=0;t.addfile(m)
   else:t.addfile(m,io.BytesIO(b'x'))
  run('unpack',d/'denied',bad,d/'denied-content',ok=False)
 assert not (d/'denied').exists()
print('PASS N1.3 portable archive: credentials excluded, exact checksums, resume, changed destination denial, traversal/credential/symlink rejection before writes (fixture).')
