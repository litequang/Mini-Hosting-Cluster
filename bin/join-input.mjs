// Never place a pairing secret in argv, history, output or an error message.
export function readJoinCode({input=process.stdin,output=process.stderr,stdin=false,timeoutMs=120000}={}){
 if(!stdin&&(!input.isTTY||typeof input.setRawMode!=='function'))throw Error('JOIN_USE_TTY_OR_STDIN_FLAG');
 return new Promise((resolve,reject)=>{
  let value='',bytes=0,done=false;const previousRaw=!!input.isRaw;
  const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);input.off('data',data);input.off('end',end);input.off('error',bad);if(!stdin){input.setRawMode(previousRaw);output.write('\n');}input.pause();error?reject(Error(error)):resolve(value.trim());};
  const data=chunk=>{bytes+=Buffer.byteLength(chunk);if(bytes>2048)return finish('JOIN_INPUT_TOO_LONG');for(const c of chunk.toString('utf8')){
   if(c==='\x03')return finish('JOIN_CANCELLED');
   if(c==='\r'||c==='\n')return finish(value.trim()?'':'JOIN_INPUT_EMPTY');
   if(!stdin&&(c==='\x7f'||c==='\b')){value=value.slice(0,-1);continue;}
   if(!/[A-Za-z0-9_.-]/.test(c))return finish('JOIN_INPUT_INVALID');value+=c;
   if(value.length>1000)return finish('JOIN_INPUT_TOO_LONG');
  }};
  const end=()=>finish(value.trim()?'':'JOIN_INPUT_EMPTY'),bad=()=>finish('JOIN_INPUT_FAILED');
  const timer=setTimeout(()=>finish('JOIN_INPUT_TIMEOUT'),timeoutMs);
  if(!stdin){output.write('Mã ghép MHC (ẩn khi nhập): ');input.setRawMode(true);}
  input.on('data',data);input.on('end',end);input.on('error',bad);input.resume();
 });
}
