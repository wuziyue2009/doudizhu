import {
  classify,
  beats,
  legalMoves,
  sortCards,
  shuffle,
  rank,
  type Pattern,
} from './cards';
import {
  calculateRatings,
  type RatingBoard,
  type RatingSample,
} from './ratings';
export type Settings = {
  mode: 'team' | 'individual';
  rounds: number;
  boards: number;
  roundBoards: number[];
  teamMinutes: number;
  seconds: number;
  format: 'best' | 'fixed';
};
export type Player = {
  id: string;
  session: string;
  name: string;
  seat: number;
  ready: boolean;
  bot: boolean;
};
export type Table = {
  id: number;
  seats: number[];
  hands: Record<number, number[]>;
  bottom: number[];
  bidOrder: number[];
  bids: { seat: number; value: number }[];
  bid: number;
  landlord: number | null;
  idle: number | null;
  active: number[];
  turn: number;
  phase: 'bid' | 'play' | 'done';
  last: { seat: number; cards: number[]; pattern: Pattern } | null;
  passes: number;
  plays: Record<number, number>;
  bombs: number;
  spring: boolean;
  winner: number | null;
  points: number;
  deadline: number;
  botAt: number;
  log: { seat: number; text: string; cards?: number[] }[];
};
export type Room = {
  code: string;
  title: string;
  owner: string;
  settings: Settings;
  players: Player[];
  status:
    | 'waiting'
    | 'playing'
    | 'board_end'
    | 'round_end'
    | 'finished'
    | 'closed';
  round: number;
  board: number;
  tables: Table[];
  scores: number[];
  totals: number[];
  wins: number[];
  teamClock?: { remaining: number[]; at: number };
  timeouts?: Record<number, number>;
  history: {
    round: number;
    board: number;
    points: number[];
    delta: number[];
    spring: boolean[];
    rating?: RatingBoard;
  }[];
  roundResults: {
    round: number;
    scores: number[];
    winner: number | null;
    ko: boolean;
  }[];
  created: number;
  updated: number;
};
export type Action = { type: string; [key: string]: unknown };
export const teamOf = (seat: number) => (seat % 2) ^ Math.floor(seat / 4);
export const capacity = (r: Room) => (r.settings.mode === 'team' ? 8 : 3);
export const boardsInRound = (r: Room) =>
  r.settings.roundBoards?.[r.round - 1] ?? r.settings.boards;
export function normalizeRoom(r: Room) {
  r.settings.roundBoards ??= Array(r.settings.rounds).fill(r.settings.boards);
  // Existing games keep their agreed clock settings; waiting rooms can opt in.
  r.settings.teamMinutes ??=
    r.status === 'waiting' && r.settings.mode === 'team' ? 15 : 0;
  r.timeouts ??= {};
  return r;
}
export function settings(input: Record<string, unknown>): Settings {
  const mode = input.mode;
  if (mode !== 'team' && mode !== 'individual')
    throw Error('请选择正确的比赛模式');
  const int = (key: string, min: number, max: number) => {
    const v = Number(input[key]);
    if (!Number.isInteger(v) || v < min || v > max)
      throw Error(
        `${key === 'rounds' ? '比赛局数' : key === 'boards' ? '每局牌数' : '每手限时'}须为 ${min}–${max} 的整数`,
      );
    return v;
  };
  const rounds = int('rounds', 1, 21),
    boards = int('boards', 1, 40),
    seconds = int('seconds', 15, 120);
  const format =
    mode === 'individual'
      ? 'fixed'
      : input.format === 'fixed'
        ? 'fixed'
        : 'best';
  if (format === 'best' && rounds % 2 === 0)
    throw Error('多数局获胜的总局数请选择奇数，例如 3、5、7 局');
  const roundBoards =
    input.roundBoards === undefined
      ? Array(rounds).fill(boards)
      : input.roundBoards;
  if (
    !Array.isArray(roundBoards) ||
    roundBoards.length !== rounds ||
    roundBoards.some((n) => !Number.isInteger(n) || n < 1 || n > 40)
  )
    throw Error('请为每一局设置 1–40 副牌，数量须与比赛局数一致');
  const teamMinutes = mode === 'team' ? Number(input.teamMinutes ?? 15) : 0;
  if (
    mode === 'team' &&
    (!Number.isInteger(teamMinutes) || teamMinutes < 1 || teamMinutes > 60)
  )
    throw Error('每队每局总用时须为 1–60 分钟');
  return {
    mode,
    rounds,
    boards,
    roundBoards: [...roundBoards],
    teamMinutes,
    seconds,
    format,
  };
}
export function cleanName(v: unknown, max = 16) {
  if (typeof v !== 'string' || !v.trim() || v.trim().length > max)
    throw Error(`请输入 1–${max} 字的${max === 16 ? '昵称' : '比赛名称'}`);
  return v.trim().replace(/[\u0000-\u001f]/g, '');
}
export function newRoom(
  code: string,
  session: string,
  input: Record<string, unknown>,
  now = Date.now(),
): Room {
  const config = settings(input);
  return {
    code,
    title: cleanName(input.title, 30),
    owner: session,
    settings: config,
    players: [
      {
        id: crypto.randomUUID(),
        session,
        name: cleanName(input.name),
        seat: 0,
        ready: true,
        bot: false,
      },
    ],
    status: 'waiting',
    round: 0,
    board: 0,
    tables: [],
    scores: [],
    totals: Array(config.mode === 'team' ? 2 : 3).fill(0),
    wins: [0, 0],
    history: [],
    roundResults: [],
    timeouts: {},
    created: now,
    updated: now,
  };
}
function clock(r: Room, t: Table, now: number) {
  const exhausted = r.teamClock && r.teamClock.remaining[teamOf(t.turn)] <= 0;
  t.deadline = now + (exhausted ? 3 : r.settings.seconds) * 1000;
  t.botAt = now + 900;
}
function resetRoundClock(r: Room, now: number) {
  if (r.settings.mode === 'team' && r.settings.teamMinutes > 0)
    r.teamClock = {
      remaining: [
        r.settings.teamMinutes * 60000,
        r.settings.teamMinutes * 60000,
      ],
      at: now,
    };
}
export function clockRates(r: Room) {
  const rates = [0, 0];
  if (r.status === 'playing')
    for (const t of r.tables) if (t.phase !== 'done') rates[teamOf(t.turn)]++;
  return rates;
}
export function effectiveDeadline(r: Room, t: Table) {
  if (!r.teamClock || t.phase === 'done') return t.deadline;
  const team = teamOf(t.turn),
    rate = clockRates(r)[team];
  return rate && r.teamClock.remaining[team] > 0
    ? Math.min(
        t.deadline,
        r.teamClock.at + r.teamClock.remaining[team] / rate + 3000,
      )
    : t.deadline;
}
export function advanceClocks(r: Room, now: number) {
  const c = r.teamClock;
  if (!c || r.status !== 'playing' || now <= c.at) return;
  const rates = clockRates(r),
    elapsed = now - c.at;
  for (let team = 0; team < 2; team++) {
    const before = c.remaining[team];
    if (before > 0 && rates[team] && elapsed * rates[team] >= before) {
      const exhaustedAt = c.at + before / rates[team];
      for (const t of r.tables)
        if (t.phase !== 'done' && teamOf(t.turn) === team)
          t.deadline = Math.min(t.deadline, exhaustedAt + 3000);
    }
    c.remaining[team] = Math.max(0, before - rates[team] * elapsed);
  }
  c.at = now;
}
export function deal(r: Room, now: number, deck = shuffle()) {
  const team = r.settings.mode === 'team';
  if (r.teamClock) r.teamClock.at = now;
  r.tables = [];
  for (let table = 0; table < (team ? 2 : 1); table++) {
    const seats = Array.from({ length: team ? 4 : 3 }, (_, i) => i + table * 4),
      idle = team ? seats[(r.board - 1) % 4] : null;
    const bidOrder = team
      ? Array.from(
          { length: 3 },
          (_, i) => seats[(seats.indexOf(idle!) + i + 1) % 4],
        )
      : Array.from({ length: 3 }, (_, i) => (r.board - 1 + i) % 3);
    const hands: Record<number, number[]> = {};
    seats.forEach((s) => (hands[s] = []));
    bidOrder.forEach(
      (s, i) => (hands[s] = sortCards(deck.slice(i * 17, i * 17 + 17))),
    );
    const t: Table = {
      id: table,
      seats,
      hands,
      bottom: deck.slice(51),
      bidOrder,
      bids: [],
      bid: 0,
      landlord: null,
      idle,
      active: [],
      turn: bidOrder[0],
      phase: 'bid',
      last: null,
      passes: 0,
      plays: {},
      bombs: 0,
      spring: false,
      winner: null,
      points: 0,
      deadline: 0,
      botAt: 0,
      log: [],
    };
    clock(r, t, now);
    r.tables.push(t);
  }
  r.status = 'playing';
}
function designate(r: Room, t: Table) {
  const highest = t.bids.find((b) => b.value === t.bid && b.value > 0);
  t.landlord = highest?.seat ?? t.bidOrder[0];
  t.bid = t.bid || 1;
  if (r.settings.mode === 'team') {
    const partner = t.seats[(t.seats.indexOf(t.landlord) + 2) % 4];
    if (partner !== t.idle) {
      t.hands[t.idle!] = t.hands[partner];
      t.hands[partner] = [];
    }
    t.idle = partner;
    t.active = [
      t.landlord,
      t.seats[(t.seats.indexOf(t.landlord) + 1) % 4],
      t.seats[(t.seats.indexOf(t.landlord) + 3) % 4],
    ];
  } else t.active = [t.landlord, (t.landlord + 1) % 3, (t.landlord + 2) % 3];
  t.hands[t.landlord] = sortCards([...t.hands[t.landlord], ...t.bottom]);
  t.turn = t.landlord;
  t.phase = 'play';
  t.log.push({ seat: t.landlord, text: `成为地主 · ${t.bid} 分` });
}
export function bid(
  r: Room,
  t: Table,
  seat: number,
  value: number,
  now: number,
) {
  if (t.phase !== 'bid' || t.turn !== seat) throw Error('还没轮到你叫分');
  if (![0, 1, 2, 3].includes(value) || (value !== 0 && value <= t.bid))
    throw Error('叫分须高于当前最高分');
  t.bids.push({ seat, value });
  t.bid = Math.max(t.bid, value);
  t.log.push({ seat, text: value ? `叫 ${value} 分` : '不叫' });
  if (value === 3 || t.bids.length === 3) designate(r, t);
  else t.turn = t.bidOrder[t.bids.length];
  clock(r, t, now);
}
export function play(
  r: Room,
  t: Table,
  seat: number,
  cards: number[],
  now: number,
) {
  if (t.phase !== 'play' || t.turn !== seat) throw Error('还没轮到你出牌');
  const hand = t.hands[seat];
  if (!cards.length) {
    if (!t.last || t.last.seat === seat) throw Error('你领出时不能不出');
    t.passes++;
    t.log.push({ seat, text: '不出' });
    if (t.passes === 2) {
      t.turn = t.last.seat;
      t.last = null;
      t.passes = 0;
    } else t.turn = t.active[(t.active.indexOf(seat) + 1) % 3];
    clock(r, t, now);
    return;
  }
  if (
    cards.some((c) => !hand.includes(c)) ||
    new Set(cards).size !== cards.length
  )
    throw Error('所选牌不在你的手牌中');
  const pattern = classify(cards);
  if (!pattern) throw Error('这组牌不是合法牌型');
  if (!beats(pattern, t.last?.pattern || null))
    throw Error('所选牌需要大于上一手牌');
  t.hands[seat] = hand.filter((c) => !cards.includes(c));
  t.last = { seat, cards: sortCards(cards), pattern };
  t.passes = 0;
  t.plays[seat] = (t.plays[seat] || 0) + 1;
  if (pattern.kind === 'bomb' || pattern.kind === 'rocket') t.bombs++;
  t.log.push({ seat, text: pattern.label, cards: sortCards(cards) });
  if (t.hands[seat].length === 0) {
    t.phase = 'done';
    t.winner = seat;
    const lordWin = seat === t.landlord;
    t.spring = lordWin
      ? t.active.filter((s) => s !== t.landlord).every((s) => !t.plays[s])
      : t.plays[t.landlord!] === 1;
    t.points = t.bid * (1 + t.bombs + (t.spring ? 1 : 0));
    t.deadline = 0;
    t.botAt = 0;
    settle(r);
  } else {
    t.turn = t.active[(t.active.indexOf(seat) + 1) % 3];
    clock(r, t, now);
  }
}
export function settle(r: Room) {
  if (r.status !== 'playing' || !r.tables.every((t) => t.phase === 'done'))
    return;
  let delta: number[];
  if (r.settings.mode === 'team') {
    const net = Math.max(
      -12,
      Math.min(
        12,
        r.tables.reduce(
          (s, t) => s + (teamOf(t.winner!) === 0 ? t.points : -t.points),
          0,
        ),
      ),
    );
    delta = [Math.max(0, net), Math.max(0, -net)];
  } else {
    const t = r.tables[0],
      sign = t.winner === t.landlord ? 1 : -1;
    delta = [0, 1, 2].map((s) =>
      s === t.landlord ? 2 * sign * t.points : -sign * t.points,
    );
  }
  r.scores = r.scores.map((s, i) => s + delta[i]);
  r.totals = r.totals.map((s, i) => s + delta[i]);
  r.history.push({
    round: r.round,
    board: r.board,
    points: r.tables.map((t) => t.points),
    delta,
    spring: r.tables.map((t) => t.spring),
    rating: ratingBoard(r),
  });
  const remaining = Math.max(0, boardsInRound(r) - r.board),
    ko =
      r.settings.mode === 'team' &&
      Math.abs(r.scores[0] - r.scores[1]) > 12 * remaining &&
      remaining > 0;
  const tied = r.settings.mode === 'team' && r.scores[0] === r.scores[1];
  if ((r.board >= boardsInRound(r) || ko) && !tied) {
    let winner: number | null = null;
    if (r.settings.mode === 'team') {
      if (!tied) {
        winner = r.scores[0] > r.scores[1] ? 0 : 1;
        r.wins[winner]++;
      } else {
        r.wins[0] += 0.5;
        r.wins[1] += 0.5;
      }
    }
    r.roundResults.push({ round: r.round, scores: [...r.scores], winner, ko });
    const won =
      r.settings.mode === 'team' &&
      Math.max(...r.wins) >
        Math.min(...r.wins) + Math.max(0, r.settings.rounds - r.round);
    r.status = won || r.round >= r.settings.rounds ? 'finished' : 'round_end';
  } else r.status = 'board_end';
}
function ratingBoard(r: Room): RatingBoard {
  if (r.players.some((p) => p.bot))
    return { samples: [], eligible: false, reason: '含电脑陪练' };
  if (
    r.settings.mode === 'team' &&
    r.tables[0].landlord! % 4 !== r.tables[1].landlord! % 4
  )
    return {
      samples: [],
      eligible: false,
      reason: '两桌角色不同，无法同牌对照',
    };
  const samples: RatingSample[] = r.tables.flatMap((t) =>
    t.active.map((seat) => ({
      seat,
      role: seat === t.landlord ? ('landlord' as const) : ('farmer' as const),
      won: (seat === t.landlord) === (t.winner === t.landlord),
      points: t.points,
    })),
  );
  if (r.settings.mode === 'team')
    for (const s of samples) {
      const other = samples.find((o) => o.seat === (s.seat + 4) % 8)!;
      const scale = 2 * Math.max(1, s.points, other.points);
      s.comparison =
        ((s.won ? 1 : -1) * s.points - (other.won ? 1 : -1) * other.points) /
        scale;
    }
  return { samples, eligible: true };
}
export function applyAction(
  r: Room,
  session: string,
  a: Action,
  now = Date.now(),
) {
  advanceClocks(r, now);
  const owner = r.owner === session,
    player = r.players.find((p) => p.session === session);
  const needOwner = () => {
    if (!owner) throw Error('只有房主可以操作');
  };
  const waiting = () => {
    if (r.status !== 'waiting') throw Error('开赛后不能更改座位或赛制');
  };
  if (a.type === 'join') {
    waiting();
    if (player) return;
    const seat = Number(a.seat);
    if (!Number.isInteger(seat) || seat < 0 || seat >= capacity(r))
      throw Error('请选择有效座位');
    const existing = r.players.find((p) => p.seat === seat);
    if (existing && !existing.bot)
      throw Error('这个座位已有人，请选择其他座位');
    r.players = r.players.filter((p) => p.seat !== seat);
    r.players.push({
      id: crypto.randomUUID(),
      session,
      name: cleanName(a.name),
      seat,
      ready: false,
      bot: false,
    });
  } else if (a.type === 'seat') {
    waiting();
    if (!player) throw Error('请先加入比赛');
    const seat = Number(a.seat);
    if (!Number.isInteger(seat) || seat < 0 || seat >= capacity(r))
      throw Error('无效座位');
    if (r.players.some((p) => p.seat === seat && !p.bot))
      throw Error('该座位已有人');
    r.players = r.players.filter((p) => p.seat !== seat);
    player.seat = seat;
    player.ready = false;
  } else if (a.type === 'ready') {
    waiting();
    if (!player) throw Error('请先加入比赛');
    player.ready = !player.ready;
  } else if (a.type === 'settings') {
    waiting();
    needOwner();
    const config = settings({ ...r.settings, ...(a.settings as object) });
    if (config.mode !== r.settings.mode)
      throw Error('请在大厅创建其他模式的比赛');
    r.settings = config;
    r.title = cleanName(a.title || r.title, 30);
    r.players.forEach((p) => (p.ready = p.bot || p.session === r.owner));
  } else if (a.type === 'bots') {
    waiting();
    needOwner();
    for (let seat = 0; seat < capacity(r); seat++)
      if (!r.players.some((p) => p.seat === seat))
        r.players.push({
          id: crypto.randomUUID(),
          session: 'bot-' + crypto.randomUUID(),
          name: '陪练 ' + (seat + 1),
          seat,
          ready: true,
          bot: true,
        });
  } else if (a.type === 'remove') {
    waiting();
    needOwner();
    const p = r.players.find((p) => p.id === a.id);
    if (p && p.session !== r.owner)
      r.players = r.players.filter((x) => x.id !== p.id);
    else throw Error('不能移除房主');
  } else if (a.type === 'leave') {
    waiting();
    if (owner) throw Error('房主请使用关闭房间');
    r.players = r.players.filter((p) => p.session !== session);
  } else if (a.type === 'close') {
    waiting();
    needOwner();
    r.status = 'closed';
  } else if (a.type === 'start') {
    waiting();
    needOwner();
    if (r.players.length !== capacity(r) || r.players.some((p) => !p.ready))
      throw Error('请等待所有座位坐满并准备');
    r.round = 1;
    r.board = 1;
    r.scores = Array(r.settings.mode === 'team' ? 2 : 3).fill(0);
    resetRoundClock(r, now);
    deal(r, now);
  } else if (a.type === 'next') {
    needOwner();
    if (r.status !== 'board_end' && r.status !== 'round_end')
      throw Error('请等待本副两桌全部结束');
    if (r.status === 'round_end') {
      r.round++;
      r.board = 1;
      r.scores = r.scores.map(() => 0);
      resetRoundClock(r, now);
    } else {
      if (
        r.settings.mode === 'team' &&
        r.board >= boardsInRound(r) &&
        r.scores[0] === r.scores[1] &&
        r.teamClock
      )
        r.teamClock.remaining = r.teamClock.remaining.map((ms) => ms + 120000);
      r.board++;
    }
    deal(r, now);
  } else if (a.type === 'bid' || a.type === 'play') {
    if (r.status !== 'playing' || !player)
      throw Error('比赛尚未开始或你未入座');
    const t = r.tables.find((t) => t.seats.includes(player.seat));
    if (!t) throw Error('无效牌桌');
    if (a.type === 'bid') bid(r, t, player.seat, Number(a.value), now);
    else {
      if (!Array.isArray(a.cards)) throw Error('请选择手牌');
      play(r, t, player.seat, a.cards as number[], now);
    }
  } else throw Error('未知操作');
  r.updated = now;
}
export function tick(r: Room, now = Date.now()) {
  if (r.status !== 'playing') return false;
  let changed = false;
  // Replay deadline events at their actual times, even if nobody polled for a while.
  // A single deal has at most 54 plays and 108 passes per table.
  for (let step = 0; step < 512 && r.status === 'playing'; step++) {
    const due = r.tables
      .filter((t) => t.phase !== 'done')
      .map((t) => ({
        t,
        at: Math.min(
          effectiveDeadline(r, t),
          r.players.find((p) => p.seat === t.turn)?.bot ? t.botAt : Infinity,
        ),
      }))
      .sort((a, b) => a.at - b.at || a.t.id - b.t.id)[0];
    if (!due || due.at > now) break;
    const t = due.t,
      eventTime = due.at;
    advanceClocks(r, eventTime);
    const p = r.players.find((p) => p.seat === t.turn);
    const isBot = p?.bot;
    if (!isBot) {
      r.timeouts ??= {};
      r.timeouts[t.turn] = (r.timeouts[t.turn] || 0) + 1;
    }
    if (t.phase === 'bid') {
      let value = 0;
      if (isBot) {
        const h = t.hands[t.turn];
        const strength = h.filter((c) => rank(c) >= 15).length;
        const bomb = Array.from({ length: 13 }, (_, i) => i + 3).some(
          (rk) => h.filter((c) => rank(c) === rk).length === 4,
        );
        const candidate = bomb || strength >= 4 ? 3 : strength >= 2 ? 1 : 0;
        value = candidate > t.bid ? candidate : 0;
      }
      bid(r, t, t.turn, value, eventTime);
    } else {
      let move: number[] = [];
      if (isBot) {
        const moves = legalMoves(t.hands[t.turn], t.last?.pattern || null);
        const ownTeam =
          t.last &&
          (r.settings.mode === 'team'
            ? teamOf(t.last.seat) === teamOf(t.turn)
            : t.last.seat !== t.landlord && t.turn !== t.landlord);
        move = ownTeam ? [] : moves[0] || [];
      } else if (!t.last)
        move =
          [...t.hands[t.turn]].sort((a, b) => rank(a) - rank(b))[0] !==
          undefined
            ? [[...t.hands[t.turn]].sort((a, b) => rank(a) - rank(b))[0]]
            : [];
      if (!t.last && !move.length)
        move = [t.hands[t.turn][t.hands[t.turn].length - 1]];
      play(r, t, t.turn, move, eventTime);
    }
    changed = true;
  }
  advanceClocks(r, now);
  if (changed) r.updated = now;
  return changed;
}
export function publicRoom(r: Room, session: string, revision: number) {
  const me = r.players.find((p) => p.session === session);
  const completed =
    r.tables.length > 0 && r.tables.every((t) => t.phase === 'done');
  return {
    code: r.code,
    title: r.title,
    settings: r.settings,
    status: r.status,
    round: r.round,
    board: r.board,
    plannedBoards: boardsInRound(r),
    teamClock: r.teamClock ? { ...r.teamClock, rates: clockRates(r) } : null,
    rating:
      r.status === 'finished'
        ? calculateRatings(r.settings.mode, r.players, r.history, r.timeouts)
        : null,
    scores: r.scores,
    totals: r.totals,
    wins: r.wins,
    history: r.history,
    roundResults: r.roundResults,
    revision,
    serverTime: Date.now(),
    isOwner: r.owner === session,
    me: me?.id || null,
    players: r.players.map(({ session, ...p }) => p),
    tables: r.tables.map((t) => {
      const seated = !!me && t.seats.includes(me.seat);
      const visible = seated || completed;
      return {
        id: t.id,
        seats: t.seats,
        phase: visible ? t.phase : 'hidden',
        turn: visible ? t.turn : null,
        bottom: visible && t.phase !== 'bid' ? t.bottom : [],
        bid: visible ? t.bid : 0,
        bids: visible ? t.bids : [],
        landlord: visible ? t.landlord : null,
        idle: visible ? t.idle : null,
        active: visible ? t.active : [],
        bombs: visible ? t.bombs : 0,
        spring: completed ? t.spring : false,
        winner: completed ? t.winner : null,
        points: completed ? t.points : 0,
        last: visible ? t.last : null,
        log: visible ? t.log : [],
        deadline: seated ? effectiveDeadline(r, t) : 0,
        counts: visible
          ? Object.fromEntries(t.seats.map((s) => [s, t.hands[s].length]))
          : {},
        hand: seated ? t.hands[me!.seat] : [],
        revealed: completed ? t.hands : null,
      };
    }),
  };
}
