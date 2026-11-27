// Password-protected, portable guest save files. No network calls or stored passwords.
import {exportBackup,parseBackup,MAX_BACKUP_BYTES} from './adventureState.mjs';
const FORMAT='fantasy-battle-encrypted-save',VERSION=1,ITERATIONS=600000;
export const MAX_ENCRYPTED_BYTES=MAX_BACKUP_BYTES*2;
const encoder=()=>new TextEncoder();
const bytesToHex=b=>Array.from(b,n=>n.toString(16).padStart(2,'0')).join('');
function hexToBytes(s,length){if(typeof s!=='string'||s.length!==length*2||!/^[0-9a-f]+$/.test(s))throw Error('Invalid encrypted backup.');return Uint8Array.from({length},(_,i)=>parseInt(s.slice(i*2,i*2+2),16));}
function toBase64(b){let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s);}
function fromBase64(s){if(typeof s!=='string'||s.length>Math.ceil((MAX_BACKUP_BYTES+16)/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(s)||s.length%4!==0)throw Error('Invalid encrypted backup.');return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
function engine(){const c=globalThis.crypto;if(!c?.subtle||!c.getRandomValues)throw Error('Encrypted backups require a secure browser context.');return c;}
function password(value){if(typeof value!=='string'||value.length<12||value.length>256)throw Error('Enter a passphrase of 12–256 characters.');return encoder().encode(value);}
async function key(c,pass,salt){const material=await c.subtle.importKey('raw',password(pass),'PBKDF2',false,['deriveKey']);return c.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
const aad=()=>encoder().encode(FORMAT+':'+VERSION+':'+ITERATIONS);
export async function encryptBackup(profile,pass){
 const raw=encoder().encode(exportBackup(profile));if(raw.length>MAX_BACKUP_BYTES)throw Error('Save backup is too large.');
 const c=engine(),salt=c.getRandomValues(new Uint8Array(16)),iv=c.getRandomValues(new Uint8Array(12)),k=await key(c,pass,salt);
 const ciphertext=new Uint8Array(await c.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(),tagLength:128},k,raw));
 return JSON.stringify({format:FORMAT,version:VERSION,kdf:'PBKDF2-SHA256',iterations:ITERATIONS,cipher:'AES-256-GCM',salt:bytesToHex(salt),iv:bytesToHex(iv),ciphertext:toBase64(ciphertext)});
}
export async function importTransfer(raw,pass=''){
 if(typeof raw!=='string'||raw.length>MAX_ENCRYPTED_BYTES||encoder().encode(raw).length>MAX_ENCRYPTED_BYTES)throw Error('Save backup is too large.');
 let data;try{data=JSON.parse(raw);}catch{throw Error('Save backup is not valid JSON.');}
 if(data?.format!==FORMAT)return parseBackup(raw);
 if(data.version!==VERSION||data.kdf!=='PBKDF2-SHA256'||data.iterations!==ITERATIONS||data.cipher!=='AES-256-GCM')throw Error('Unsupported encrypted backup version.');
 const salt=hexToBytes(data.salt,16),iv=hexToBytes(data.iv,12),ciphertext=fromBase64(data.ciphertext);
 if(ciphertext.length<17||ciphertext.length>MAX_BACKUP_BYTES+16)throw Error('Invalid encrypted backup.');
 const c=engine(),k=await key(c,pass,salt);
 let plain;try{plain=await c.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad(),tagLength:128},k,ciphertext);}catch{throw Error('Incorrect passphrase or damaged encrypted backup.');}
 return parseBackup(new TextDecoder('utf-8',{fatal:true}).decode(plain));
}
