import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import {inside} from './security.mjs';

// Dependency-free, bounded ZIP extraction: STORED and DEFLATE entries only.
// Denies symlinks, traversal, encrypted entries, ZIP64, nested dirs escaping root.
export function extractZip(buf,target,{maxFiles=1500,maxTotal=120*1024*1024}={}){
 if(buf.length>64*1024*1024)throw Error('ZIP over 64 MiB');
 const lo=Math.max(0,buf.length-65557);let eocd=-1;
 for(let p=buf.length-22;p>=lo;p--)if(buf.readUInt32LE(p)===0x06054b50){eocd=p;break;}
 if(eocd<0)throw Error('Invalid ZIP: no end-of-central-directory');
 const count=buf.readUInt16LE(eocd+10),offset=buf.readUInt32LE(eocd+16),cdSize=buf.readUInt32LE(eocd+12);
 if(count>maxFiles||count===0||offset===0xffffffff||cdSize===0xffffffff||offset+cdSize>buf.length)throw Error('Invalid/oversized ZIP');
 let p=offset,total=0;const entries=[];const known=new Set();
 for(let i=0;i<count;i++){
  if(p+46>buf.length||buf.readUInt32LE(p)!==0x02014b50)throw Error('Invalid ZIP central directory');
  const madeBy=buf.readUInt16LE(p+4)>>8,flags=buf.readUInt16LE(p+8),method=buf.readUInt16LE(p+10);
  const packed=buf.readUInt32LE(p+20),unpacked=buf.readUInt32LE(p+24),fnLen=buf.readUInt16LE(p+28),extra=buf.readUInt16LE(p+30),comment=buf.readUInt16LE(p+32);
  const external=buf.readUInt32LE(p+38),local=buf.readUInt32LE(p+42);
  if(p+46+fnLen+extra+comment>buf.length)throw Error('Truncated ZIP entry');
  const name=buf.subarray(p+46,p+46+fnLen).toString('utf8');p+=46+fnLen+extra+comment;
  if(flags&1||![0,8].includes(method)||packed===0xffffffff||unpacked===0xffffffff)throw Error('Unsupported ZIP entry');
  const unixMode=madeBy===3?(external>>>16):0;
  if((unixMode&0xf000)===0xa000)throw Error('ZIP symlink not allowed');
  const isDir=name.endsWith('/');let normalized=name.replace(/\\/g,'/');
  if(isDir)normalized=normalized.slice(0,-1);
  if(!normalized||normalized.startsWith('/')||normalized.split('/').some(s=>!s||s==='.'||s==='..')||/^[A-Za-z]:/.test(normalized))throw Error('ZIP path rejected');
  if(known.has(normalized))throw Error('Duplicate ZIP path');known.add(normalized);
  total+=unpacked;if(total>maxTotal)throw Error('ZIP expanded size over limit');
  entries.push({normalized,isDir,method,packed,unpacked,local});
 }
 // Prevent file/directory collisions and writing children under file entries.
 const files=new Set(entries.filter(e=>!e.isDir).map(e=>e.normalized));
 for(const entry of entries)for(const ancestor of entry.normalized.split('/').slice(0,-1).map((_,i,a)=>a.slice(0,i+1).join('/')))if(files.has(ancestor))throw Error('ZIP path collision');
 fs.mkdirSync(target,{recursive:true,mode:0o700});
 for(const e of entries){
  const out=inside(target,e.normalized);
  if(e.isDir){fs.mkdirSync(out,{recursive:true,mode:0o755});continue;}
  if(e.local+30>buf.length||buf.readUInt32LE(e.local)!==0x04034b50)throw Error('Invalid ZIP local header');
  const dataStart=e.local+30+buf.readUInt16LE(e.local+26)+buf.readUInt16LE(e.local+28);
  if(dataStart+e.packed>buf.length)throw Error('Invalid ZIP data range');
  const packed=buf.subarray(dataStart,dataStart+e.packed);
  const data=e.method===0?packed:zlib.inflateRawSync(packed,{maxOutputLength:maxTotal});
  if(data.length!==e.unpacked)throw Error('ZIP size mismatch');
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,data,{mode:0o644,flag:'wx'});
 }
 return {entries:entries.length,bytes:total};
}
