// In-memory wakeups for the existing Authority job relay. No scheduler/storage/lease decisions.
export class JobWake {
 constructor(){this.generation=new Map();this.waiters=new Map();}
 version(id){return this.generation.get(id)||0;}
 notify(id){if(!id)return;this.generation.set(id,this.version(id)+1);this.waiters.get(id)?.finish();}
 async wait(id,observed,ms){
  if(this.version(id)!==observed||ms<=0)return;
  this.waiters.get(id)?.finish();
  return new Promise(resolve=>{
   const entry={finish:()=>{clearTimeout(entry.timer);if(this.waiters.get(id)===entry)this.waiters.delete(id);resolve();}};
   entry.timer=setTimeout(entry.finish,Math.min(60000,ms));this.waiters.set(id,entry);
   if(this.version(id)!==observed)entry.finish();
  });
 }
}
