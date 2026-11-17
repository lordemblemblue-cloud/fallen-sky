import { createFileRoute } from '@tanstack/react-router';
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
const authorized = (context) => faceDraftEnabled(process.env,context.user);
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
          const raw=await request.text();
          if(raw.length>8_000_000)return deny('photos-too-large',413);
          input=JSON.parse(raw);
        }catch{return deny('invalid-request')}
        return reply(await createFaceDraft({env:process.env,user:context.user,input}));
      },
      GET: async ({request,context}) => {
        if(!authorized(context))return deny('face-draft-disabled-or-not-authorized',403);
        return reply(await getFaceDraft({
          env:process.env,user:context.user,ticket:ticketOf(request)}));
      },
      DELETE: async ({request,context}) => {
        if(!authorized(context))return deny('face-draft-disabled-or-not-authorized',403);
        if(!requireSameOrigin(request))return deny('invalid-origin',403);
        return reply(await getFaceDraft({
          env:process.env,user:context.user,ticket:ticketOf(request),remove:true}));
      },
    },
  },
});
