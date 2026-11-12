// Combat / Quest 17.3 — NPC invitations and consensual Rival statuses.
// Deliberately read-only: availability does not create acceptance, a match,
// an invitation to meet, an opponent vote, or any XP / item rewards.
import {useEffect,useMemo,useRef,useState} from 'react';
import {BookOpen,Shield,Users,X,RefreshCw} from 'lucide-react';
import {QUEST_NPCS} from '../../questData';
import {projectAXEQuestbookSocialLeads173} from '../quests/AXEQuestbookSocialLeads173';
import './AXEQuestbookSocialLeads173.css';

const npcNames=new Map(QUEST_NPCS.map(n=>[n.id,n.name]));
const shortId=x=>typeof x==='string'?x.replaceAll('_',' ').slice(0,90):'Unknown';
const ownChoice=x=>x==='rival'?'Rival':x==='friendly_rival'?'Friendly rival':
  x==='decline'?'Declined':'No decision recorded';

export default function AXEQuestbookSocialLeads173({
  view=null,onClose,onRefresh,onCommit=null,error=null
}) {
  const root=useRef(null);
  const social=useMemo(()=>projectAXEQuestbookSocialLeads173(view),[view]);
  const [confirmation,setConfirmation]=useState(null);
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState('');
  useEffect(()=>{
    setConfirmation(null);setFeedback('');
  },[view]);
  const commit=async()=>{
    if(!confirmation||busy||!social.verified||typeof onCommit!=='function')return;
    const valid=confirmation.intent==='accept_quest'
      ? social.npcInvitations.some(x=>x.questId===confirmation.questId)
      : confirmation.intent==='choose_rival'
        ? social.rivalStatuses.some(x=>x.leadId===confirmation.leadId&&
            x.requiresExplicitConsent===true&&x.ownChoice===null)
        : false;
    if(!valid){setConfirmation(null);setFeedback('This invitation is no longer verified.');return;}
    setBusy(true);setFeedback('');
    try{
      const answer=await onCommit({...confirmation,confirmed:true});
      if(answer?.ok!==true)throw Error('Request not confirmed');
      setFeedback(confirmation.intent==='accept_quest'
        ? 'The server accepted this quest. Refreshing your journal.'
        : 'Your Rival decision was recorded. Refreshing your journal.');
      setConfirmation(null);
    }catch{
      setFeedback('The game server could not verify this request. Nothing was credited.');
    }finally{setBusy(false)}
  };
  useEffect(()=>{
    const previous=document.activeElement;
    root.current?.focus();
    return ()=>{if(previous?.isConnected)previous.focus?.({preventScroll:true})};
  },[]);
  return <div className="axe-quest-social-shade"
    onMouseDown={event=>{if(event.currentTarget===event.target)onClose?.()}}>
    <section ref={root} tabIndex={-1} role="dialog" aria-modal="true"
      aria-labelledby="axe-quest-social-title" className="axe-quest-social-dialog"
      onKeyDown={event=>{
        // Keep ESC from also closing the parent Services workspace.
        event.stopPropagation();
        if(event.key==='Escape'){event.preventDefault();onClose?.()}
        if(event.key==='Tab'){
          const controls=[...event.currentTarget.querySelectorAll('button:not(:disabled)')];
          const first=controls[0],last=controls[controls.length-1];
          if(!first){event.preventDefault();root.current?.focus()}
          else if(event.shiftKey&&(document.activeElement===first||
              document.activeElement===event.currentTarget)){
            event.preventDefault();last.focus();
          }else if(!event.shiftKey&&document.activeElement===last){
            event.preventDefault();first.focus();
          }
        }
      }}>
      <header className="axe-quest-social-header">
        <div>
          <small>Chronicles of AXE · Server verification</small>
          <h2 id="axe-quest-social-title">Quest Invitations & Rivals</h2>
        </div>
        <div className="axe-quest-social-tools">
          {typeof onRefresh==='function'&&
            <button type="button" onClick={onRefresh} aria-label="Refresh verified invitations">
              <RefreshCw size={16}/> Refresh
            </button>}
          <button type="button" onClick={()=>onClose?.()}
            aria-label="Close invitations and Rival status"><X size={20}/></button>
        </div>
      </header>
      <p className="axe-quest-social-disclaimer">
        Invitations and relationship status come only from the verified server.
        Actions require your explicit confirmation and a separate authenticated server request.
        No rewards are issued by this panel.
      </p>
      {!social.verified?(
        <div className="axe-quest-social-unavailable" role="status">
          <Shield size={24}/>
          <strong>Verified invitations are unavailable</strong>
          <p>{error||'Your Questbook must first be confirmed by the authenticated game server.'}</p>
          <p>Local quest progress and unverified player claims are not used here.</p>
        </div>
      ):(
        <div className="axe-quest-social-grid">
          <section aria-label="NPC quest invitations">
            <h3><BookOpen size={20}/> NPC Quest Invitations
              <span>{social.npcInvitations.length}</span></h3>
            {!social.npcInvitations.length&&
              <p className="axe-quest-social-empty">
                No NPC quest invitations have been verified yet.
              </p>}
            {social.npcInvitations.map(lead=>
              <article key={lead.questId} className="axe-quest-social-lead">
                <small>{lead.optional?'Optional story path':'Story chapter invitation'}</small>
                <h4>{lead.title}</h4>
                <p>Quest giver: <strong>{npcNames.get(lead.npcId)||shortId(lead.npcId)}</strong></p>
                <p>Unlocked by verified prerequisite: {shortId(lead.prerequisiteId)}</p>
                <div className="axe-quest-social-lead-status">
                  <Shield size={15}/> Invitation available — not accepted
                </div>
                <p className="axe-quest-social-footnote">
                  Quest acceptance requires a separate server-owned check of
                  character ownership, catalog eligibility and completed prerequisites.
                </p>
                {typeof onCommit==='function'&&
                  <button type="button" disabled={busy}
                    className="axe-quest-social-action" onClick={()=>
                      setConfirmation({intent:'accept_quest',questId:lead.questId,
                        leadId:null,choice:null})}>
                    Request quest acceptance
                  </button>}
              </article>
            )}
          </section>
          <section aria-label="Player Rival relationship statuses">
            <h3><Users size={20}/> Rival Status
              <span>{social.rivalStatuses.length}</span></h3>
            {!social.rivalStatuses.length&&
              <p className="axe-quest-social-empty">
                There are no server-verified Rival invitations for this character.
              </p>}
            {social.rivalStatuses.map(lead=>
              <article key={lead.leadId} className="axe-quest-social-lead">
                <small>Private player relationship</small>
                <h4>Character: {shortId(lead.otherCharacterId)}</h4>
                <p><strong>{lead.statusLabel}</strong></p>
                <p>Your choice: {ownChoice(lead.ownChoice)}</p>
                <div className="axe-quest-social-lead-status">
                  <Shield size={15}/>
                  {lead.mutualConsent
                    ? 'Both players consented to this relationship.'
                    : lead.requiresExplicitConsent
                      ? 'No choice has been submitted for you.'
                      : 'No mutual Rival relationship has been established.'}
                </div>
                <p className="axe-quest-social-footnote">
                  The other player's private vote is never displayed.
                  Only matching explicit choices can create a mutual relationship.
                </p>
                {typeof onCommit==='function'&&lead.requiresExplicitConsent&&
                  lead.ownChoice===null&&
                  <div className="axe-quest-social-choices">
                    {[['rival','Rival'],['friendly_rival','Friendly Rival'],
                      ['decline','Decline']].map(([choice,label])=>
                      <button type="button" key={choice} disabled={busy}
                        className="axe-quest-social-action" onClick={()=>
                          setConfirmation({intent:'choose_rival',questId:null,
                            leadId:lead.leadId,choice})}>
                        {label}
                      </button>)}
                  </div>}
              </article>
            )}
          </section>
        </div>
      )}
      {confirmation&&social.verified&&typeof onCommit==='function'&&
        <div className="axe-quest-social-confirm" role="group" aria-label="Confirm game server action">
          <p>{confirmation.intent==='accept_quest'
            ? 'Accept this quest? The server will check its prerequisites.'
            : 'Submit this Rival choice? It cannot be silently changed afterward.'}</p>
          <div>
            <button type="button" disabled={busy} onClick={()=>setConfirmation(null)}>
              Cancel
            </button>
            <button type="button" disabled={busy} onClick={commit}>
              {busy?'Submitting…':'Confirm server action'}
            </button>
          </div>
        </div>}
      {feedback&&<p className="axe-quest-social-feedback" role="status">{feedback}</p>}
      <footer className="axe-quest-social-footer">
        Server-authenticated intent · No automatic acceptance, meetings or reward writes
      </footer>
    </section>
  </div>;
}
