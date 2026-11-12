// Pure display projections. Notifications are derived from authoritative snapshots;
// loading a save, changing character or reading history must never invent an event.

const safeNumber = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const positiveInt = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const cleanText = (value, length = 200) =>
  typeof value === 'string' ? value.trim().slice(0, length) : '';

export function levelMilestone(previous, current) {
  const from = positiveInt(previous?.level);
  const to = positiveInt(current?.level);
  if (from === null || to === null || from < 1 || to <= from) return null;

  const stats = [
    ['HP', previous?.maxHP, current?.maxHP],
    ['ATK', previous?.derived?.damage, current?.derived?.damage],
    ['DEF', previous?.derived?.defense, current?.derived?.defense],
  ].flatMap(([label, oldValue, newValue]) => {
    const a = safeNumber(oldValue), b = safeNumber(newValue);
    return a !== null && b !== null && b > a
      ? [{label, before: Math.round(a), after: Math.round(b), gain: Math.round(b - a)}]
      : [];
  });
  const beforePoints = safeNumber(previous?.unspentPoints);
  const afterPoints = safeNumber(current?.unspentPoints);
  return {
    kind:'level',
    level:to,
    priorLevel:from,
    levelsGained:to - from,
    stats:stats.filter(s=>s.gain > 0),
    pointsGained: beforePoints !== null && afterPoints !== null
      ? Math.max(0, Math.floor(afterPoints - beforePoints)) : 0,
  };
}

export function questArtVariant(questId) {
  const id = cleanText(questId,128);
  const chapterIllustrations = [
    'echo_ch_14_first_echo', 'echo_ch_15_world_signs',
    'echo_ch_16_crossroads', 'echo_ch_17_aftershocks',
    'echo_ch_18_traces_remain',
  ];
  const originalChapter = chapterIllustrations.indexOf(id);
  if(originalChapter !== -1) return originalChapter;
  let value = 17;
  for(let i = 0; i < id.length; i++) value = ((value * 31) + id.charCodeAt(i)) >>> 0;
  return value % 5;
}
export function questArtworkUrl(quest) {
  const raw = quest?.bannerImage || quest?.bannerUrl || quest?.artworkUrl || quest?.imageUrl || '';
  if(typeof raw !== 'string') return '';
  const url = raw.trim();
  // Don't let quest metadata become an arbitrary javascript:/data: URL.
  return /^https:\/\/[^\s]+$/i.test(url) || /^\/assets\/[\w./-]+\.(?:png|jpe?g|webp|avif)$/i.test(url) ? url : '';
}
export function questMilestones(previous, current, catalog = []) {
  const oldCompleted = new Set(Array.isArray(previous?.completedIds) ? previous.completedIds : []);
  const completed = Array.isArray(current?.completedIds) ? current.completedIds : [];
  const quests = Array.isArray(catalog) ? catalog : [];
  const completedSet = new Set(completed);
  return completed
    .filter(id=>typeof id === 'string' && !oldCompleted.has(id))
    .flatMap(id=>{
      const quest = quests.find(q=>q?.id === id);
      if(!quest || quest.repeatable) return [];
      // Unlock is announced only if a defined next chapter is now eligible.
      const next = quests.find(q=>q?.category === 'chapter' && q.requires === id &&
        !completedSet.has(q.id) &&
        Number(q.unlockLevel || 1) <= Number(current?.level || Infinity) &&
        (q.storyFlagsRequired || []).every(flag=>current?.storyFlags?.[flag]));
      const chapter = cleanText(quest.chapter,24);
      return [{
        kind:'story', questId:id,
        heading: chapter ? `Chapter ${chapter} Complete` : 'Quest Complete',
        questTitle:cleanText(quest.title || quest.name || id,120),
        nextHeading:next?.chapter ? `Chapter ${cleanText(next.chapter,24)} Unlocked` : '',
        nextQuestTitle: next ? cleanText(next.title || next.name,120) : '',
        image:questArtworkUrl(quest),
        artVariant:questArtVariant(id),
      }];
    });
}
export function incomingDirectMessage(event, currentUserId) {
  const type = cleanText(event?.type,20).toLowerCase();
  if (type && type !== 'create' && type !== 'insert') return null;
  const m = event?.data || event;
  const me = String(currentUserId || '');
  const senderId = String(m?.sender_id || '');
  if(!me || !senderId || senderId === me ||
    String(m?.receiver_id || '') !== me) return null;
  const content = cleanText(m?.content, 600);
  const kind = cleanText(m?.message_type || 'text',20);
  const preview = content || (kind !== 'text' ? 'Sent an attachment' : '');
  if(!preview) return null;
  return {
    kind:'message', senderId, text:preview,
    messageId:String(m?.client_msg_id || m?.id || ''),
    conversationId:String(m?.conversation_id || ''),
    senderName:cleanText(m?.sender_name,100),
    senderAvatar:cleanText(m?.sender_avatar || m?.avatar_url,500),
  };
}
