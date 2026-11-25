import { createFileRoute } from '@tanstack/react-router';
import { secrets } from 'base44:runtime';
import { requireUserRoute } from '@/lib/auth-middleware';
import {
  createFaceDraft, faceDraftEnabled, getFaceDraft,
} from '../../../server/game3d/meshyFaceDraftService.mjs';

// Signed-in, explicitly allowlisted TEST-only endpoint. Never ship a public
// credit-spending image-generation service without durable quota and billing.
// Raw face photos exist only in this request and are forwarded to Meshy after
// affirmative opt-in; no photo, task or credential is written to character saves.
const deny = (code,status=400) => Response.json({ok:false,code},{status,
  headers:{'cache-control':'no-store'}});
const reply = result => Response.json(result,{
  status:result.ok?200:result.status||400,
  headers:{'cache-control':'no-store','x-content-type-options':'nosniff'},
});
// App secrets, read through the platform runtime (no process.env on Workers).
const FACE_ENV_KEYS = [
  'GAME3D_MESHY_FACE_ENABLED', 'GAME3D_MESHY_FACE_SERVER_ENV', 'MESHY_API_KEY',
  'GAME3D_MESHY_FACE_SIGNING_SECRET', 'GAME3D_MESHY_FACE_ALLOWED_USERS',
];
const faceEnv = () => FACE_ENV_KEYS.reduce((env, key) => {
  const value = secrets.get(key);
  if (value !== undefined) env[key] = value;
  return env;
}, {});
const authorized = (context) => faceDraftEnabled(faceEnv(),context.user);
const requireSameOrigin = request => {
  const origin=request.headers.get('origin');
  // Bearer token is required; Origin also blocks cross-site browser attempts.
  return Boolean(origin)&&origin===new URL(request.url).origin;
};
const ticketOf=request => new URL(request.url).searchParams.get('ticket')||'';

export const Route = createFileRoute('/api/game3d-face')({
  server: {
    middleware:[requireUserRoute],
    handlers: {
      POST: async ({request,context}) => {
        if(!authorized(context))return deny('face-draft-disabled-or-not-authorized',403);
        if(!requireSameOrigin(request))return deny('invalid-origin',403);
        if((Number(request.headers.get('content-length'))||0)>8_000_000)
          return deny('photos-too-large',413);
        let input;
        try{
          // Browsers can submit resized JPEG data URLs. Fail closed if more
          // than 8 MB, even when Content-Length was omitted.
          const reader=request.body?.getReader();
          if(!reader)return deny('invalid-request');
          const decoder=new TextDecoder();
          let bytes=0, raw='';
          try {
            for (;;) {
              const {done,value}=await reader.read();
              if(done)break;
              bytes+=value.byteLength;
              if(bytes>8_000_000){
                await reader.cancel().catch(()=>{});
                return deny('photos-too-large',413);
              }
              raw+=decoder.decode(value,{stream:true});
            }
            raw+=decoder.decode();
          } finally { reader.releaseLock(); }
          input=JSON.parse(raw);
        }catch{return deny('invalid-request')}
        return reply(await createFaceDraft({env:faceEnv(),user:context.user,input}));
      },
      GET: async ({request,context}) => {
        if(!authorized(context))return deny('face-draft-disabled-or-not-authorized',403);
        return reply(await getFaceDraft({
          env:faceEnv(),user:context.user,ticket:ticketOf(request)}));
      },
      DELETE: async ({request,context}) => {
        if(!authorized(context))return deny('face-draft-disabled-or-not-authorized',403);
        if(!requireSameOrigin(request))return deny('invalid-origin',403);
        return reply(await getFaceDraft({
          env:faceEnv(),user:context.user,ticket:ticketOf(request),remove:true}));
      },
    },
  },
});