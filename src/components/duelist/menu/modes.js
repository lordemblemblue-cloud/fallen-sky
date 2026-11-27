// What the menus say about each way to play (the rules themselves live in sim/match.mjs).
import { Swords, Users, Shield, Flag, Target, Shuffle } from 'lucide-react';

export const MENU_MODES = Object.freeze({
  online: {
    title: 'Online', icon: Shuffle, accent: '#e6c78f', online: true,
    blurb: 'Instantly join a random Team Deathmatch, Capture the Flag or Control Point match.',
    rules: ['The server chooses the mode randomly.', 'Open seats are filled with bots until more players join.'],
  },
  practice: {
    title: 'Practice', icon: Target, accent: '#9fe8ff', online: true,
    blurb: 'Train alone or with another player. No score, no clock.',
    rules: ['Try every strike, Telekinesis power and roll.', 'Fall and you are back on your feet in a moment.', 'Pick the bots\' level and how many.'],
  },
  duel: {
    title: 'Duel', icon: Swords, accent: '#ffd36a', online: true,
    blurb: 'One on one. First to three rounds.',
    rules: ['A round lasts 90 seconds; at the bell, whoever stands better takes it.', 'A fresh round starts both fighters at full strength.', 'Online, you face a player or a bot until one joins.'],
  },
  ffa: {
    title: 'Free for all', icon: Users, accent: '#ff8a7a', online: true,
    blurb: 'Six fighters, everyone for themselves.',
    rules: ['First to 15 defeats wins, or the most when 8 minutes end.', 'You come back 3 seconds after a fall, protected for a moment.', 'Bots fill the empty places and step out when players join.'],
  },
  escort: {
    title: 'Escort Transport', icon: Shield, accent: '#dfb36f', online: true,
    blurb: 'Red escorts the freight carrier. Blue holds the delivery gate.',
    rules: ['Stand inside the carrier ring to push or contest it.', 'Blue wins at three minutes if Red is outside the ring.', 'Red can finish in overtime while an attacker stays with the carrier.'],
  },
  football: {
    title: 'Football', icon: Target, accent: '#f6cd82', online: true,
    blurb: 'Team goal scoring with a live ball and bot-filled teams.',
    rules: ['Move toward the ball to dribble or press F to kick it farther.', 'Five goals wins, or lead at the end of eight minutes.', 'Bots fill open slots and step out as humans join.'],
  },
  tdm: {
    title: 'Team deathmatch', icon: Shield, accent: '#5fb4ff', online: true,
    blurb: 'Red against blue, four a side.',
    rules: ['First team to 30 defeats, or the most at 8 minutes.', 'Teams stay even: a joining player takes a bot\'s place on the side that needs one.'],
  },
  control: {
    title: 'Control Point', icon: Shield, accent: '#c8aeff', online: true,
    blurb: 'Capture A, B and C. Control at least two points to earn progress toward 100%.',
    rules: ['Hold a point uncontested for four seconds to capture it.', 'Two points earn 1% per second; all three earn 2% per second.', 'A contested point cannot change hands while both teams stand on it.'],
  },
  ctf: {
    title: 'Capture the flag', icon: Flag, accent: '#7dffb0', online: true,
    blurb: 'Take their flag home while yours is home.',
    rules: ['First to three captures, or the most at 10 minutes.', 'A carrier who falls, is knocked down or held in a grip drops the flag: push them.', 'Touch your own dropped flag to send it home. Carriers cannot sprint.'],
  },
});

export const MODE_ORDER = Object.freeze(['online', 'duel', 'ctf', 'football', 'tdm', 'control', 'escort', 'practice']);
export const LEVELS = Object.freeze([['trainee', 'Trainee'], ['duelist', 'Duelist'], ['master', 'Master']]);
