/* MedTerm Forge Ver 5 — IndexedDB primary progress store.
   A failed write is never reported as saved. The older localStorage key is read-only
   migration input; manual JSON export remains recommended. */
(()=>{'use strict';
const DB_NAME='medterm-forge-progress-v5',STORE='records',OLD_KEY='medterm-forge-v1';
let db=null,enabled=false,ready=false,writeChain=Promise.resolve(),lastError='',lastSaved=0,migration='';
function openDB(){return new Promise((resolve,reject)=>{if(!('indexedDB' in window))return reject(Error('IndexedDB 사용 불가'));
 const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};
 r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('DB 열기 실패'));r.onblocked=()=>reject(Error('기존 탭에서 저장소 업데이트가 차단됨'));
})}
function get(key){return new Promise((resolve,reject)=>{const t=db.transaction(STORE,'readonly'),r=t.objectStore(STORE).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('읽기 실패'))})}
function put(key,value){return new Promise((resolve,reject)=>{const t=db.transaction(STORE,'readwrite');t.objectStore(STORE).put(value,key);t.oncomplete=()=>resolve(true);t.onerror=()=>reject(t.error||Error('쓰기 실패'));t.onabort=()=>reject(t.error||Error('쓰기 취소'))})}
function legacy(){try{const raw=localStorage.getItem(OLD_KEY);return raw?JSON.parse(raw):null}catch(e){return null}}
function emit(){window.dispatchEvent(new CustomEvent('medterm-v5-storage-status',{detail:{enabled,ready,lastError,lastSaved,migration}}))}
const api={
 get enabled(){return enabled},get status(){return{enabled,ready,lastError,lastSaved,migration}},
 async bootstrap(){try{
  db=await openDB();enabled=true;let value=await get('progress');const old=legacy();
  if(value&&value.version===1){window.__MEDTERM_V5_INITIAL_STATE__=value;migration='IndexedDB 진도 불러옴'}
  else if(old&&old.version===1){await put('progress',old);window.__MEDTERM_V5_INITIAL_STATE__=old;migration='기존 localStorage 진도를 IndexedDB로 이전함'}
  else migration='새 IndexedDB 저장소 준비됨';
  ready=true;emit();return true;
 }catch(e){lastError=String(e.message||e);enabled=false;ready=true;migration='브라우저 저장 제한 — JSON 백업 필요';emit();return false}},
 save(value){if(!enabled){lastError=lastError||'IndexedDB 저장소가 비활성화되어 있음';emit();return Promise.resolve(false)}
 // Capture the snapshot at the call boundary so a later mutation cannot rewrite history.
 let snapshot;try{snapshot=structuredClone(value)}catch(e){lastError=String(e.message||e);emit();return Promise.resolve(false)}
 writeChain=writeChain.catch(()=>{}).then(()=>put('progress',snapshot)).then(()=>{lastError='';lastSaved=Date.now();emit();return true},e=>{lastError=String(e.message||e);emit();return false});return writeChain;
 },
 async replace(value,reason){if(!enabled)throw Error('IndexedDB를 사용할 수 없음');await writeChain.catch(()=>{});
  const prior=await get('progress');if(prior)await this.backup(prior,reason||'교체 전');
  await put('progress',structuredClone(value));lastSaved=Date.now();lastError='';emit();return true;
 },
 async backup(value,reason){if(!enabled)throw Error('IndexedDB를 사용할 수 없음');const stamp=new Date().toISOString();const key='backup-'+stamp;
  await put(key,{createdAt:stamp,reason:String(reason||'수동'),progress:structuredClone(value)});
  const keys=await new Promise((resolve,reject)=>{const t=db.transaction(STORE,'readonly'),r=t.objectStore(STORE).getAllKeys();r.onsuccess=()=>resolve(r.result.filter(k=>String(k).startsWith('backup-')).sort());r.onerror=()=>reject(r.error)});
  for(const stale of keys.slice(0,-3))await new Promise((resolve,reject)=>{const t=db.transaction(STORE,'readwrite');t.objectStore(STORE).delete(stale);t.oncomplete=resolve;t.onerror=()=>reject(t.error)});
  return key;
 },
 async current(){if(!enabled)throw Error('IndexedDB 사용 불가');await writeChain.catch(()=>{});return get('progress')},
 async backups(){if(!enabled)return [];const keys=await new Promise((resolve,reject)=>{const t=db.transaction(STORE,'readonly'),r=t.objectStore(STORE).getAllKeys();r.onsuccess=()=>resolve(r.result.filter(k=>String(k).startsWith('backup-')).sort().reverse());r.onerror=()=>reject(r.error)});return Promise.all(keys.map(async k=>({key:k,...await get(k)})))},
 async restoreBackup(key){if(!enabled)throw Error('IndexedDB를 사용할 수 없음');const b=await get(key);if(!b?.progress)throw Error('백업을 찾지 못함');return this.replace(b.progress,'백업 복원 전')},
 flush(){return writeChain.catch(()=>false)}
};
window.MedTermPersistV5=api;
})();
