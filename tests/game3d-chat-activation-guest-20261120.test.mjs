import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nextChatEnterState,isIncomingChatMessage}
  from '../src/components/game3d/social/chatVisibilityModel.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('one Enter reveals and focuses the existing translucent chat for guest players',()=>{
  const first=nextChatEnterState({expanded:false,typing:false});
  assert.deepEqual(first,{expanded:true,typing:true,tab:'world'});
  // A second Enter while the composer owns input must not reopen anything.
  assert.equal(nextChatEnterState(first),null);
  assert.deepEqual(nextChatEnterState({expanded:true,typing:false}),first);
});
test('Enter does not steal input from other overlays, form fields or repeats',()=>{
  for(const field of ['suppressed','editable','composing','repeat','typing'])
    assert.equal(nextChatEnterState({[field]:true}),null,field);
  assert.equal(nextChatEnterState({tab:'combat'}).tab,'world');
});
test('remote messages reveal chat even without a signed-in account, never deleted or own messages',()=>{
  const m={sender_id:'someone-else',channel_id:'game3d_world'};
  assert.equal(isIncomingChatMessage(m,null),true);
  assert.equal(isIncomingChatMessage(m,'self'),true);
  assert.equal(isIncomingChatMessage({...m,sender_id:'self'},'self'),false);
  assert.equal(isIncomingChatMessage({...m,is_deleted:true},'self'),false);
  assert.equal(isIncomingChatMessage(null,null),false);
});
test('real mounted world chat keeps a faded idle panel instead of a Chat Enter button',()=>{
  const chat=read('src/components/game3d/social/WorldChatPanel.jsx');
  const css=read('src/components/game3d/social/Game3DChatChannels.css');
  const game=read('src/pages/GameView.jsx');
  assert.match(chat,/nextChatEnterState\(/);
  assert.match(chat,/addEventListener\('keydown', onKey, true\)/);
  assert.doesNotMatch(chat,/\|\| !userId\) return;/);
  assert.doesNotMatch(chat,/game3d-chat-awaken|game3d-chat-channel-hint|Enter again to type|Enter to open/);
  assert.match(chat,/typing&&tab!=='combat'/);
  assert.match(chat,/isIncomingChatMessage\(message,userId\)/);
  assert.match(chat,/setExpanded\(true\)/);
  assert.doesNotMatch(css,/\.game3d-chat-awaken/);
  assert.match(css,/\.game3d-world-chat\.is-idle:not\(\.is-pinned\) \{\s*opacity:\.24;visibility:visible;/);
  assert.match(css,/\.game3d-world-chat:focus-within/);
  assert.doesNotMatch(css,/max-height:min\(250px,max\(0px,calc\(100dvh/);
  assert.match(game,/<WorldChatPanel userId=\{user\?\.id\}/);
});
test('unauthenticated guest sending remains server-authorized, never reports fake success',()=>{
  const chat=read('src/components/game3d/social/WorldChatPanel.jsx');
  const server=read('base44/functions/worldChat/entry.ts');
  assert.match(chat,/if \(!userId\) \{/);
  assert.match(chat,/needs server support for guest characters/);
  assert.match(server,/if \(!user\) return json\(\{ error: 'Unauthorized' \}, 401\)/);
});

test('successful sends re-reveal actual chat and fade only after activity timeout',()=>{
  const chat=read('src/components/game3d/social/WorldChatPanel.jsx');
  assert.match(chat,/if \(message\) addLines\(tab, \[message\]\);[\s\S]*?setDraft\(''\);[\s\S]*?setTyping\(false\);[\s\S]*?setExpanded\(true\);[\s\S]*?setActivity\(value => value \+ 1\);/);
  assert.match(chat,/setTimeout\(\(\) => setExpanded\(false\), 9000\)/);
  assert.match(chat,/isIncomingChatMessage\(message,userId\)/);
});
