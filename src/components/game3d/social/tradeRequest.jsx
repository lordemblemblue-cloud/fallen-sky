import { base44 } from '@/api/base44Client';
import { openTrade } from './socialStores';

const TRADE_BUCKET = 'trade';
const SEND_COOLDOWN_MS = 6000;
const recentSendTimes = new Map();
const dataOf = (response) => response?.data || response || {};

// All friend-card trades now bootstrap through the same backend used by the
// Luna Friends panel. That backend creates the pending TradeSession, links the
// SocialRequest, and keeps UserCard ownership as the single source of truth.
export const sendTradeRequest = async (sender, receiver) => {
  const key = `${sender?.id || 'local'}:${receiver.id}`;
  const now = Date.now();
  if (now - (recentSendTimes.get(key) ?? -Infinity) < SEND_COOLDOWN_MS) {
    const error = new Error('Trade request already sent. Wait a few seconds before trying again.');
    error.code = 'cooldown';
    throw error;
  }
  recentSendTimes.set(key, now);
  try {
    const response = await base44.functions.invoke('friendCardTrade', {
      action: 'start',
      payload: { partnerId: receiver.id },
    });
    const data = dataOf(response);
    if (data.error) throw new Error(data.error);
    return data.session;
  } catch (error) {
    recentSendTimes.delete(key);
    throw error;
  }
};

export const acceptTradeRequest = async (req) => {
  const response = await base44.functions.invoke('friendCardTrade', {
    action: 'accept',
    payload: { partnerId: req.sender_id },
  });
  const data = dataOf(response);
  if (data.error) throw new Error(data.error);

  // Open the same real-time trade surface immediately for the receiver. The
  // sender is opened by TradeSessionWatcher / the accepted SocialRequest event.
  openTrade({ id: req.sender_id, name: req.sender_name });
  return data.session;
};

export const declineTradeRequest = async (req) => {
  const response = await base44.functions.invoke('friendCardTrade', {
    action: 'decline',
    payload: { partnerId: req.sender_id },
  });
  const data = dataOf(response);
  if (data.error) throw new Error(data.error);
  // friendCardTrade marks the request declined; the browser cannot delete it
  return data.session;
};

export { TRADE_BUCKET };
