'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Spade,
  Copy,
  Users,
  Settings2,
  Play,
  ArrowRight,
  Check,
  Clock3,
  ShieldCheck,
  Bot,
  ArrowLeft,
  Download,
  RefreshCw,
  Trophy,
  X,
  Lightbulb,
  Hand,
  Link as LinkIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MatchSettings, defaultSettings } from '@/components/match-settings';
import {
  classify,
  beats,
  cardLabel,
  rank,
  rankLabel,
  legalMoves,
} from '@/lib/cards';
import { teamOf, type publicRoom } from '@/lib/game';
type View = ReturnType<typeof publicRoom>;
type TableView = View['tables'][number];
const states: Record<string, string> = {
  waiting: '等待入座',
  playing: '比赛进行中',
  board_end: '本副已结算',
  round_end: '本局已结束',
  finished: '比赛已完成',
  closed: '房间已关闭',
};
function CardFace({
  card,
  small = false,
  selected = false,
  onClick,
  disabled = false,
}: {
  card: number;
  small?: boolean;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const red = card === 53 || (card < 52 && [1, 2].includes(card % 4));
  const content = (
    <>
      <span className="card-rank">
        {card >= 52 ? (card === 52 ? '小' : '大') : rankLabel(rank(card))}
      </span>
      <span className="card-suit">
        {card >= 52 ? '王' : ['♣', '♦', '♥', '♠'][card % 4]}
      </span>
      <span className="card-corner">
        {card >= 52 ? '★' : ['♣', '♦', '♥', '♠'][card % 4]}
      </span>
    </>
  );
  return onClick ? (
    <button
      type="button"
      disabled={disabled}
      aria-label={cardLabel(card)}
      aria-pressed={selected}
      onClick={onClick}
      className={`playing-card ${red ? 'red-card' : ''} ${small ? 'small-card' : ''} ${selected ? 'selected' : ''}`}
    >
      {content}
    </button>
  ) : (
    <span
      className={`playing-card ${red ? 'red-card' : ''} ${small ? 'small-card' : ''}`}
      aria-label={cardLabel(card)}
    >
      {content}
    </span>
  );
}
function useWebTools(
  room: View | null,
  act: (action: Record<string, unknown>) => Promise<View | null>,
) {
  const roomRef = useRef(room),
    actRef = useRef(act);
  roomRef.current = room;
  actRef.current = act;
  useEffect(() => {
    const context = (
      document as unknown as { modelContext?: { registerTool: Function } }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools = [
      {
        name: 'read_match',
        title: '查看当前比赛',
        description:
          '读取当前房间、本人座位、当前手牌、局数与比分。只包含当前访客获准查看的信息。',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: () => roomRef.current,
      },
      {
        name: 'join_match',
        title: '加入比赛座位',
        description: '以昵称加入当前房间的指定空位。座位编号从 0 开始。',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 16 },
            seat: { type: 'integer', minimum: 0, maximum: 7 },
          },
          required: ['name', 'seat'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: async (input: unknown) => {
          const a = input as { name: unknown; seat: unknown };
          if (!a || typeof a.name !== 'string' || !Number.isInteger(a.seat))
            throw Error('需要昵称和有效座位');
          const r = await actRef.current({
            type: 'join',
            name: a.name,
            seat: a.seat,
          });
          if (!r) throw Error('加入失败，请检查座位');
          return { code: r.code, me: r.me };
        },
      },
      {
        name: 'set_match_ready',
        title: '切换准备状态',
        description: '切换本人在当前房间中的准备状态。',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async () => {
          const r = await actRef.current({ type: 'ready' });
          if (!r) throw Error('准备失败');
          return { ready: r.players.find((p) => p.id === r.me)?.ready };
        },
      },
    ];
    for (const tool of tools)
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    return () => lifecycle.abort();
  }, []);
}
export default function RoomClient({ code }: { code: string }) {
  const [room, setRoom] = useState<View | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(''),
    [selected, setSelected] = useState<number[]>([]),
    [notice, setNotice] = useState(''),
    [time, setTime] = useState(Date.now()),
    [connected, setConnected] = useState(false),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(defaultSettings()),
    [viewTable, setViewTable] = useState(0);
  const roomRef = useRef<View | null>(null),
    offset = useRef(0),
    pollActive = useRef(false),
    actionActive = useRef(false),
    hintIndex = useRef(0);
  const accept = useCallback((r: View) => {
    if (!roomRef.current || r.revision >= roomRef.current.revision) {
      roomRef.current = r;
      setRoom(r);
      offset.current = r.serverTime - Date.now();
      setConnected(true);
    }
  }, []);
  const refresh = useCallback(async () => {
    if (pollActive.current || actionActive.current) return;
    pollActive.current = true;
    try {
      const res = await fetch('/api/rooms/' + code, { cache: 'no-store' });
      const data = (await res.json()) as View & { error?: string };
      if (!res.ok) throw Error(data.error);
      accept(data);
      if (!roomRef.current) setError('');
    } catch (e) {
      setConnected(false);
      if (!roomRef.current)
        setError(e instanceof Error ? e.message : '无法连接');
    } finally {
      pollActive.current = false;
    }
  }, [code, accept]);
  useEffect(() => {
    refresh();
    const t = setInterval(() => {
        if (!document.hidden) refresh();
      }, 1000),
      clock = setInterval(() => setTime(Date.now() + offset.current), 250);
    const visible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearInterval(t);
      clearInterval(clock);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);
  async function act(action: Record<string, unknown>) {
    if (actionActive.current) return null;
    actionActive.current = true;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/rooms/' + code, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
      });
      const data = (await res.json()) as View & { error?: string };
      if (!res.ok) throw Error(data.error || '操作失败');
      accept(data);
      return data as View;
    } catch (e) {
      setError(e instanceof Error ? e.message : '连接失败，请重试');
      return null;
    } finally {
      actionActive.current = false;
      setBusy(false);
      refresh();
    }
  }
  useWebTools(room, act);
  const me = room?.players.find((p) => p.id === room.me),
    myTable = room?.tables.find((t) => me && t.seats.includes(me.seat));
  const signature =
    room && myTable
      ? `${room.round}:${room.board}:${myTable.turn}:${myTable.hand.join(',')}`
      : '';
  useEffect(() => {
    setSelected([]);
    hintIndex.current = 0;
  }, [signature]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(t);
  }, [notice]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        window.location.origin + '/room/' + code,
      );
      setNotice('邀请链接已复制，发给好友即可加入');
    } catch {
      setNotice('请复制浏览器地址栏中的房间链接');
    }
  }
  function exportScores() {
    if (!room) return;
    const csv = (x: unknown) =>
      '"' +
      String(x)
        .replace(/^[=+@-]/, "'")
        .replaceAll('"', '""') +
      '"';
    const names =
      room.settings.mode === 'team'
        ? ['红队', '蓝队']
        : [0, 1, 2].map(
            (s) => room.players.find((p) => p.seat === s)?.name || '选手',
          );
    const rows = [
      ['比赛', room.title],
      ['局', '副', ...names],
      ...room.history.map((h) => [h.round, h.board, ...h.delta]),
      ['全场合计', '', ...room.totals],
    ];
    if (room.rating) {
      rows.push(
        ['个人表现分', room.rating.method],
        ['选手', '表现分', '有效副数', '地主副数', '农民副数', '超时次数'],
      );
      for (const p of room.rating.entries)
        rows.push([
          p.name,
          p.score ?? '未评级',
          p.samples,
          p.landlordSamples,
          p.farmerSamples,
          p.timeouts,
        ]);
    }
    const blob = new Blob(
      ['\ufeff' + rows.map((row) => row.map(csv).join(',')).join('\r\n')],
      { type: 'text/csv;charset=utf-8;' },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = `牌局-${code}-成绩.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!room)
    return (
      <main className="empty-screen">
        <Spade size={42} />
        <h1>{error ? '暂时无法进入房间' : '正在连接牌桌…'}</h1>
        <p>{error || '加载你的比赛与座位'}</p>
        <Button onClick={refresh} variant="outline">
          <RefreshCw size={16} />
          重新连接
        </Button>
        <a href="/">返回大厅</a>
      </main>
    );
  const team = room.settings.mode === 'team',
    cap = team ? 8 : 3,
    allDone =
      room.tables.length > 0 && room.tables.every((t) => t.phase === 'done'),
    isTurn =
      myTable?.turn === me?.seat &&
      room.status === 'playing' &&
      myTable?.phase !== 'done';
  const t = allDone
    ? room.tables[viewTable] || myTable || room.tables[0]
    : myTable;
  const secondsLeft = myTable
    ? Math.max(0, Math.ceil((myTable.deadline - time) / 1000))
    : 0;
  const expected = myTable
    ? `${room.round}:${room.board}:${myTable.log.length}:${myTable.turn}`
    : '';
  const pattern = classify(selected),
    valid = !!pattern && beats(pattern, myTable?.last?.pattern || null);
  const pname = (seat: number | null) =>
    room.players.find((p) => p.seat === seat)?.name || '选手';
  const role = (tab: TableView, seat: number) =>
    tab.phase === 'bid'
      ? tab.idle === seat
        ? '叫牌闲家'
        : '等待叫分'
      : tab.landlord === seat
        ? '地主'
        : tab.idle === seat
          ? '闲家'
          : '农民';
  function hint() {
    if (!myTable) return;
    const moves = legalMoves(myTable.hand, myTable.last?.pattern || null);
    if (!moves.length) {
      setSelected([]);
      setNotice('没有能压过的牌，可以选择不出');
      return;
    }
    setSelected(moves[hintIndex.current++ % moves.length]);
  }
  function playerBadge(seat: number, tab?: TableView) {
    const p = room!.players.find((p) => p.seat === seat);
    if (!p) return null;
    const turn = tab && tab.turn === seat && tab.phase !== 'done';
    return (
      <div
        className={
          'player-badge ' +
          (turn ? 'current-player ' : '') +
          (team ? (teamOf(seat) === 0 ? 'team-red' : 'team-blue') : '')
        }
      >
        <span className="avatar">
          {p.bot ? <Bot size={20} /> : p.name.slice(0, 1)}
        </span>
        <div>
          <strong>
            {p.name}
            {p.id === room!.me && <small> 你</small>}
          </strong>
          <span>
            {tab ? role(tab, seat) : `座位 ${(seat % 4) + 1}`}
            {p.bot ? ' · 电脑' : ''}
          </span>
        </div>
        {tab && (
          <b className="card-count">
            {tab.counts[seat] ?? 0}
            <small>张</small>
          </b>
        )}
      </div>
    );
  }
  return (
    <div className="site-shell">
      <header className="topbar room-topbar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Spade size={23} fill="currentColor" />
          </span>
          <strong>牌局</strong>
        </a>
        <nav>
          <a href="/rules" target="_blank">
            本站规则
          </a>
          <span className={'live-tag ' + (!connected ? 'disconnected' : '')}>
            <i />
            {connected ? '已连接' : '正在重连'}
          </span>
          <Button variant="outline" onClick={copy}>
            <Copy size={15} />
            邀请好友
          </Button>
        </nav>
      </header>
      <main className="room-main">
        <div className="room-heading">
          <div>
            <a className="back-link" href="/">
              <ArrowLeft size={13} />
              比赛大厅
            </a>
            <h1>{room.title}</h1>
            <p>
              {team ? '4 对 4 复式团体赛' : '三人个人赛'}
              <span>·</span>
              {room.settings.format === 'best'
                ? `${room.settings.rounds} 局 ${Math.floor(room.settings.rounds / 2) + 1} 胜`
                : `共 ${room.settings.rounds} 局`}
              <span>·</span>逐局设置牌数<span>·</span>常规每手上限{' '}
              {room.settings.seconds} 秒
            </p>
          </div>
          <div className="room-code">
            <span>房间码</span>
            <button onClick={copy}>
              {code}
              <Copy size={13} />
            </button>
            <small>{states[room.status]}</small>
          </div>
        </div>
        <div className="schedule-strip" aria-label="比赛逐局安排">
          {room.settings.roundBoards.map((n, i) => (
            <span key={i} className={room.round === i + 1 ? 'active' : ''}>
              第 {i + 1} 局 <b>{n} 副</b>
              {i < room.roundResults.length ? ' · 已结束' : ''}
            </span>
          ))}
        </div>
        {notice && (
          <div className="toast-note" role="status">
            <Check size={16} />
            {notice}
          </div>
        )}
        {error && (
          <div className="error-message" role="alert">
            {error}
            <button onClick={() => setError('')} aria-label="关闭提示">
              <X size={16} />
            </button>
          </div>
        )}
        {!connected && (
          <div className="connection-note">
            连接中断，系统正在重试。出牌时限仍在继续，请保持页面打开。
          </div>
        )}
        {room.status === 'closed' ? (
          <section className="panel empty-screen">
            <h2>这场聚会已结束</h2>
            <p>房主已关闭房间。回到大厅创建一场新比赛。</p>
            <a className="back-link" href="/">
              返回大厅 <ArrowRight size={16} />
            </a>
          </section>
        ) : room.status === 'waiting' ? (
          <div className="room-grid">
            <section className="panel seating-panel">
              <div className="section-title">
                <span className="icon-box">
                  <Users />
                </span>
                <div>
                  <h2>入座，准备开场</h2>
                  <p>
                    {room.players.length}/{cap} 人已入座 ·{' '}
                    {room.players.filter((p) => p.ready).length} 人已准备
                  </p>
                </div>
              </div>
              {!me && (
                <div className="join-name">
                  <label htmlFor="player-name">你的昵称</label>
                  <Input
                    id="player-name"
                    maxLength={16}
                    placeholder="输入昵称，再选择下方座位"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}
              {Array.from({ length: team ? 2 : 1 }, (_, table) => (
                <div key={table} className="seat-table">
                  <div className="seat-table-title">
                    <strong>
                      {team ? (table === 0 ? 'A 桌' : 'B 桌') : '个人赛牌桌'}
                    </strong>
                    <span>
                      {team
                        ? '同队相对而坐 · 两桌相同发牌'
                        : '三人独立积分 · 地主一对二'}
                    </span>
                  </div>
                  <div className={'seat-grid ' + (!team ? 'three-seats' : '')}>
                    {Array.from(
                      { length: team ? 4 : 3 },
                      (_, i) => i + table * 4,
                    ).map((seat) => {
                      const p = room.players.find((p) => p.seat === seat);
                      return (
                        <div
                          key={seat}
                          className={
                            'seat-card ' +
                            (team
                              ? teamOf(seat) === 0
                                ? 'team-red'
                                : 'team-blue'
                              : '')
                          }
                        >
                          <div className="seat-label">
                            {team
                              ? teamOf(seat) === 0
                                ? '红队'
                                : '蓝队'
                              : '选手'}{' '}
                            · {(seat % 4) + 1} 号位{' '}
                            {p?.id === room.me ? <small>本人</small> : null}
                          </div>
                          {p ? (
                            <>
                              <div className="seat-person">
                                <span className="avatar">
                                  {p.bot ? (
                                    <Bot size={22} />
                                  ) : (
                                    p.name.slice(0, 1)
                                  )}
                                </span>
                                <strong>
                                  {p.name}
                                  {p.id === room.me ? '（你）' : ''}
                                </strong>
                              </div>
                              <div
                                className={
                                  'ready-badge ' + (p.ready ? 'ready' : '')
                                }
                              >
                                {p.ready ? (
                                  <>
                                    <Check size={13} />
                                    已准备
                                  </>
                                ) : (
                                  '等待准备'
                                )}
                                {p.bot && ' · 电脑'}
                              </div>
                              {room.isOwner && p.id !== room.me && (
                                <button
                                  className="remove-player"
                                  aria-label={'移除' + p.name}
                                  onClick={() =>
                                    act({ type: 'remove', id: p.id })
                                  }
                                >
                                  <X size={13} />
                                </button>
                              )}
                              {p.bot && !me && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy || !name.trim()}
                                  onClick={() =>
                                    act({ type: 'join', name, seat })
                                  }
                                >
                                  替换陪练入座
                                </Button>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="empty-seat">
                                <Users size={25} />
                                <span>虚位以待</span>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy || (!me && !name.trim())}
                                onClick={() =>
                                  act({
                                    type: me ? 'seat' : 'join',
                                    seat,
                                    name,
                                  })
                                }
                              >
                                {me ? '换到这里' : '选择此座位'}
                              </Button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="lobby-controls">
                {me && (
                  <Button
                    variant={me.ready ? 'outline' : 'default'}
                    disabled={busy}
                    onClick={() => act({ type: 'ready' })}
                  >
                    {me.ready ? '取消准备' : '我准备好了'}
                    <Check size={15} />
                  </Button>
                )}
                {room.isOwner ? (
                  <Button
                    disabled={
                      busy ||
                      room.players.length !== cap ||
                      room.players.some((p) => !p.ready)
                    }
                    onClick={() => act({ type: 'start' })}
                  >
                    <Play size={16} />
                    开始比赛
                  </Button>
                ) : (
                  me && (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => act({ type: 'leave' })}
                    >
                      退出座位
                    </Button>
                  )
                )}
              </div>
              <p className="form-note">
                {room.isOwner
                  ? '所有座位坐满并准备后即可开赛。可用电脑陪练补齐空位。'
                  : '选择同队座位，再点击准备，等待房主开赛。'}
              </p>
            </section>
            <aside className="side-stack">
              <section className="panel room-settings">
                <h2>
                  <Settings2 size={19} />
                  比赛设置
                </h2>
                {editing ? (
                  <>
                    <MatchSettings value={draft} onChange={setDraft} />
                    <div className="button-row">
                      <Button
                        disabled={busy}
                        onClick={async () => {
                          if (await act({ type: 'settings', settings: draft }))
                            setEditing(false);
                        }}
                      >
                        保存设置
                      </Button>
                      <Button variant="ghost" onClick={() => setEditing(false)}>
                        取消
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <dl>
                      <div>
                        <dt>比赛局数</dt>
                        <dd>{room.settings.rounds} 局</dd>
                      </div>
                      <div>
                        <dt>每局牌数</dt>
                        <dd>{room.settings.roundBoards.join(' / ')} 副</dd>
                      </div>
                      <div>
                        <dt>每手限时</dt>
                        <dd>{room.settings.seconds} 秒</dd>
                      </div>
                      <div>
                        <dt>胜负方式</dt>
                        <dd>
                          {room.settings.format === 'best'
                            ? '多数局获胜'
                            : team
                              ? '累计胜局'
                              : '累计个人积分'}
                        </dd>
                      </div>
                      {team && (
                        <div>
                          <dt>每队每局总用时</dt>
                          <dd>{room.settings.teamMinutes} 分钟</dd>
                        </div>
                      )}
                    </dl>
                    {room.isOwner && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setDraft({ ...room.settings });
                          setEditing(true);
                        }}
                      >
                        修改设置
                      </Button>
                    )}
                  </>
                )}
                {room.isOwner && (
                  <>
                    <Button
                      variant="outline"
                      disabled={busy || room.players.length === cap}
                      onClick={() => act({ type: 'bots' })}
                    >
                      <Bot size={16} />
                      电脑补齐空位
                    </Button>
                    <button
                      className="text-button muted"
                      onClick={() => {
                        if (
                          window.confirm('关闭这个房间？好友将无法继续加入。')
                        )
                          act({ type: 'close' });
                      }}
                    >
                      关闭房间
                    </button>
                  </>
                )}
              </section>
              <section className="field-note">
                <div className="tiny-label">READY WHEN YOU ARE</div>
                <h3>
                  好朋友，
                  <br />
                  同一张牌桌。
                </h3>
                <p>
                  分享邀请链接，朋友用手机或电脑打开，输入昵称即可入座。无需安装应用。
                </p>
                <div className="note-line">
                  <LinkIcon size={18} />
                  <span>{code}</span>
                </div>
              </section>
            </aside>
          </div>
        ) : (
          <>
            {team && room.teamClock && (
              <section className="team-clocks" aria-label="本局队伍总用时">
                {[0, 1].map((side) => {
                  const c = room.teamClock!;
                  const ms = Math.max(
                    0,
                    c.remaining[side] -
                      c.rates[side] * Math.max(0, time - c.at),
                  );
                  return (
                    <div
                      key={side}
                      className={
                        'team-clock ' +
                        (side === 0 ? 'team-red' : 'team-blue') +
                        (ms === 0 ? ' exhausted' : '')
                      }
                    >
                      <span>{side === 0 ? '红队' : '蓝队'} · 本局总用时</span>
                      <strong>{formatClock(ms)}</strong>
                      <small>
                        {ms === 0
                          ? '总用时已耗尽 · 每手 3 秒'
                          : c.rates[side]
                            ? `计时中 · ${c.rates[side]} 桌累计扣时`
                            : '暂停扣时'}
                      </small>
                    </div>
                  );
                })}
                <p>仅轮到本队思考时扣时；每次平局加赛双方各补 2 分钟。</p>
              </section>
            )}
            <div className="score-banner">
              {team ? (
                <>
                  <div className="score-team team-red">
                    <span>红队</span>
                    <strong>{room.scores[0] || 0}</strong>
                    <small>已赢 {room.wins[0]} 局</small>
                  </div>
                  <div className="score-center">
                    <span>第 {room.round} 局</span>
                    <b>
                      {room.status === 'finished'
                        ? '全场结束'
                        : `第 ${room.board} 副${room.board > room.plannedBoards ? ' · 加副' : ''}`}
                    </b>
                    <small>{states[room.status]}</small>
                  </div>
                  <div className="score-team team-blue">
                    <span>蓝队</span>
                    <strong>{room.scores[1] || 0}</strong>
                    <small>已赢 {room.wins[1]} 局</small>
                  </div>
                </>
              ) : (
                <>
                  <div className="score-center">
                    <span>
                      第 {room.round} 局 · 第 {room.board} 副
                    </span>
                    <b>{states[room.status]}</b>
                  </div>
                  {[0, 1, 2].map((s) => (
                    <div key={s} className="individual-score">
                      <span>{pname(s)}</span>
                      <strong>
                        {room.totals[s] > 0 ? '+' : ''}
                        {room.totals[s]}
                      </strong>
                      <small>累计积分</small>
                    </div>
                  ))}
                </>
              )}
            </div>
            {room.status === 'finished' && (
              <section className="match-result">
                <Trophy size={36} />
                <div>
                  <h2>
                    {team
                      ? room.wins[0] === room.wins[1]
                        ? '精彩较量，双方战平'
                        : `${room.wins[0] > room.wins[1] ? '红队' : '蓝队'}赢得比赛`
                      : `${[0, 1, 2]
                          .filter(
                            (s) => room.totals[s] === Math.max(...room.totals),
                          )
                          .map(pname)
                          .join('、')} 获得第一名`}
                  </h2>
                  <p>
                    {team
                      ? `最终胜局 ${room.wins[0]} : ${room.wins[1]}`
                      : '按全部牌副的累计积分排名，同分并列。'}{' '}
                    · 成绩已保存
                  </p>
                </div>
                <Button variant="outline" onClick={exportScores}>
                  <Download size={16} />
                  导出成绩
                </Button>
                <a href="/">
                  再办一场 <ArrowRight size={15} />
                </a>
              </section>
            )}
            {room.rating && (
              <section className="panel performance-result">
                <div className="performance-heading">
                  <div>
                    <h2>个人表现分</h2>
                    <p>
                      {room.rating.method} · 本场参考 ·{' '}
                      {room.rating.excludedBoards} 副未纳入评级
                    </p>
                  </div>
                  <a href="/#rating-rules" target="_blank">
                    查看计算规则 ↗
                  </a>
                </div>
                <div className="performance-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>名次</th>
                        <th>选手</th>
                        <th>表现分</th>
                        <th>有效副数</th>
                        <th>地主 / 农民</th>
                        <th>超时次数</th>
                        <th>说明</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...room.rating.entries]
                        .sort(
                          (a, b) =>
                            (b.score ?? -1) - (a.score ?? -1) ||
                            a.seat - b.seat,
                        )
                        .map((p) => (
                          <tr key={p.id}>
                            <td>
                              {p.score === null
                                ? '—'
                                : 1 +
                                  room.rating!.entries.filter(
                                    (x) =>
                                      x.score !== null && x.score > p.score!,
                                  ).length}
                            </td>
                            <td>{p.name}</td>
                            <td>
                              <strong>{p.score ?? '未评级'}</strong>
                            </td>
                            <td>{p.samples}</td>
                            <td>
                              {p.landlordSamples} / {p.farmerSamples}
                            </td>
                            <td>{p.timeouts}</td>
                            <td>
                              {p.bot
                                ? '电脑陪练'
                                : p.score === null
                                  ? '无有效样本'
                                  : p.provisional
                                    ? '样本不足 · 暂定'
                                    : '本场表现参考'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <p>
                  合作胜负无法完全拆分个人贡献；此分数不作为跨比赛累计段位。
                </p>
              </section>
            )}
            <div className="game-grid">
              <section className="table-panel">
                <div className="table-toolbar">
                  <span>
                    <LayersIcon />
                    {t ? ` ${t.id === 0 ? 'A' : 'B'} 桌` : '牌桌保密中'}
                  </span>
                  {allDone && team && (
                    <div className="table-tabs">
                      {[0, 1].map((id) => (
                        <button
                          key={id}
                          className={t?.id === id ? 'active' : ''}
                          onClick={() => setViewTable(id)}
                        >
                          {id === 0 ? 'A 桌' : 'B 桌'}结果
                        </button>
                      ))}
                    </div>
                  )}
                  <small>
                    <ShieldCheck size={13} />
                    {allDone
                      ? team
                        ? '两桌结束 · 牌面已公开'
                        : '本副结束 · 牌面已公开'
                      : '仅显示本人手牌'}
                  </small>
                </div>
                {!t ? (
                  <div className="empty-screen">
                    <ShieldCheck size={40} />
                    <h2>{me ? '等待同步' : '比赛已经开始'}</h2>
                    <p>
                      {me
                        ? '正在恢复你的座位与手牌'
                        : '你未参加这场比赛。对局中的手牌保密，结束后可以查看比分。'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="felt">
                      <div className="opponents">
                        {t.seats
                          .filter((s) => s !== me?.seat)
                          .map((seat) => (
                            <div key={seat}>
                              {playerBadge(seat, t)}
                              {t.phase === 'bid' && (
                                <span className="bid-bubble">
                                  {t.bids.find((b) => b.seat === seat)
                                    ?.value === 0
                                    ? '不叫'
                                    : t.bids.find((b) => b.seat === seat)?.value
                                      ? `叫 ${t.bids.find((b) => b.seat === seat)?.value} 分`
                                      : t.idle === seat
                                        ? '本副不叫分'
                                        : '等待'}
                                </span>
                              )}
                            </div>
                          ))}
                      </div>
                      <div className="table-middle">
                        <div className="bottom-cards">
                          <span>底牌</span>
                          {t.bottom.length
                            ? t.bottom.map((c) => (
                                <CardFace key={c} card={c} small />
                              ))
                            : [0, 1, 2].map((c) => (
                                <span className="card-back" key={c}>
                                  ♠
                                </span>
                              ))}
                          <span className="table-multiplier">
                            {t.bid || '—'} 分 · {t.bombs} 炸
                          </span>
                        </div>
                        <div className="trick-area">
                          {t.phase === 'bid' ? (
                            <>
                              <Spade className="felt-symbol" size={30} />
                              <h3>等待 {pname(t.turn)} 叫分</h3>
                              <p>叫分最高者成为地主</p>
                            </>
                          ) : t.phase === 'done' ? (
                            <>
                              <Trophy size={30} />
                              <h3>
                                {allDone
                                  ? `${pname(t.winner)}所在阵营获胜`
                                  : '本桌已结束，等待另一桌'}
                              </h3>
                              <p>
                                {allDone
                                  ? `${t.points} 分${t.spring ? ' · ' + (t.winner === t.landlord ? '春天' : '反春') : ''}`
                                  : '两桌都完成后，统一结算本副分数'}
                              </p>
                            </>
                          ) : t.last ? (
                            <>
                              <span className="played-by">
                                {pname(t.last.seat)} · {t.last.pattern.label}
                              </span>
                              <div className="mini-hand">
                                {t.last.cards.map((c) => (
                                  <CardFace key={c} card={c} small />
                                ))}
                              </div>
                            </>
                          ) : (
                            <>
                              <Hand size={29} />
                              <h3>{pname(t.turn)} 领出</h3>
                              <p>可以打出任意合法牌型</p>
                            </>
                          )}
                        </div>
                      </div>
                      {me && t.seats.includes(me.seat) && (
                        <div className="self-line">
                          {playerBadge(me.seat, t)}
                          {isTurn && (
                            <span
                              className={
                                'turn-clock ' +
                                (secondsLeft <= 5 ? 'urgent' : '')
                              }
                            >
                              <Clock3 size={17} />
                              {secondsLeft} 秒
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {myTable && me && t.id === myTable.id && (
                      <div className="hand-section">
                        <div className="hand-caption">
                          <span>
                            {role(myTable, me.seat) === '闲家'
                              ? '本副休息'
                              : `你的手牌 · ${myTable.hand.length} 张`}
                          </span>
                          <span>
                            {selected.length
                              ? `${selected.length} 张已选${pattern ? ' · ' + pattern.label : ' · 组合不合法'}`
                              : '点击手牌选择，再点击出牌'}
                          </span>
                        </div>
                        <div className="hand-scroll">
                          <div className="hand-cards">
                            {myTable.hand.map((c) => (
                              <CardFace
                                key={c}
                                card={c}
                                selected={selected.includes(c)}
                                disabled={myTable.phase !== 'play' || !isTurn}
                                onClick={() =>
                                  setSelected((s) =>
                                    s.includes(c)
                                      ? s.filter((x) => x !== c)
                                      : [...s, c],
                                  )
                                }
                              />
                            ))}
                          </div>
                        </div>
                        <div className="action-bar">
                          {myTable.phase === 'bid' ? (
                            isTurn ? (
                              <>
                                {[0, 1, 2, 3].map((value) => (
                                  <Button
                                    key={value}
                                    variant={value ? 'default' : 'outline'}
                                    disabled={
                                      busy ||
                                      (value !== 0 && value <= myTable.bid)
                                    }
                                    onClick={() =>
                                      act({ type: 'bid', value, expected })
                                    }
                                  >
                                    {value ? `叫 ${value} 分` : '不叫'}
                                  </Button>
                                ))}
                              </>
                            ) : (
                              <p>
                                {myTable.idle === me.seat
                                  ? '你是本副叫牌闲家，等待地主确定'
                                  : '等待其他选手叫分'}
                              </p>
                            )
                          ) : myTable.phase === 'play' ? (
                            <>
                              <Button
                                variant="ghost"
                                onClick={() => setSelected([])}
                                disabled={!selected.length || busy}
                              >
                                取消选择
                              </Button>
                              <Button
                                variant="outline"
                                disabled={!isTurn || busy}
                                onClick={hint}
                              >
                                <Lightbulb size={15} />
                                提示
                              </Button>
                              <Button
                                variant="outline"
                                disabled={!isTurn || busy || !myTable.last}
                                onClick={() =>
                                  act({ type: 'play', cards: [], expected })
                                }
                              >
                                不出
                              </Button>
                              <Button
                                className="play-button"
                                disabled={!isTurn || busy || !valid}
                                onClick={() =>
                                  act({
                                    type: 'play',
                                    cards: selected,
                                    expected,
                                  })
                                }
                              >
                                出牌
                                <ArrowRight size={15} />
                              </Button>
                            </>
                          ) : (
                            <p>本副对局已结束</p>
                          )}
                        </div>
                        {myTable.phase === 'play' && !isTurn && (
                          <p className="form-note">
                            {myTable.idle === me.seat
                              ? '你是地主搭档，本副休息。'
                              : '等待 ' + pname(myTable.turn) + ' 出牌'}
                          </p>
                        )}
                      </div>
                    )}
                    {allDone && t.revealed && (
                      <details className="revealed-hands">
                        <summary>查看本桌剩余手牌</summary>
                        {t.seats
                          .filter((s) => t.revealed?.[s]?.length)
                          .map((s) => (
                            <div key={s}>
                              <span>{pname(s)}</span>
                              <div className="mini-hand">
                                {t.revealed![s].map((c) => (
                                  <CardFace key={c} card={c} small />
                                ))}
                              </div>
                            </div>
                          ))}
                      </details>
                    )}
                  </>
                )}
                {(room.status === 'board_end' ||
                  room.status === 'round_end') && (
                  <div className="continue-panel">
                    <div>
                      <strong>
                        {room.status === 'round_end'
                          ? `第 ${room.round} 局结束${room.roundResults.at(-1)?.ko ? ' · KO' : ''}`
                          : room.board >= room.plannedBoards
                            ? '比分持平，进入加副'
                            : '本副已结算'}
                      </strong>
                      <p>
                        {team &&
                        room.status === 'board_end' &&
                        room.board >= room.plannedBoards
                          ? '下一副为加赛，开始时双方各补 2 分钟。'
                          : room.isOwner
                            ? '确认选手准备好后，继续比赛。'
                            : '等待房主继续比赛'}
                      </p>
                    </div>
                    {room.isOwner && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          act({
                            type: 'next',
                            expected: `${room.round}:${room.board}:${room.status}`,
                          })
                        }
                      >
                        {room.status === 'round_end'
                          ? '开始下一局'
                          : '继续下一副'}
                        <ArrowRight size={16} />
                      </Button>
                    )}
                  </div>
                )}
              </section>
              <aside className="side-stack">
                <section className="panel match-ledger">
                  <h2>
                    <Trophy size={18} />
                    比赛记录
                  </h2>
                  <div className="ledger-header">
                    <span>局 / 副</span>
                    <span>{team ? '红队 : 蓝队' : '个人分变化'}</span>
                  </div>
                  <div className="ledger-list">
                    {room.history.length ? (
                      [...room.history]
                        .reverse()
                        .slice(0, 30)
                        .map((h, i) => (
                          <div key={i}>
                            <span>
                              {h.round} / {h.board}
                            </span>
                            <strong>
                              {team
                                ? `${h.delta[0]} : ${h.delta[1]}`
                                : h.delta
                                    .map((d) => (d > 0 ? '+' + d : d))
                                    .join(' / ')}
                            </strong>
                          </div>
                        ))
                    ) : (
                      <p className="empty-note">
                        第一副结束后，比分会出现在这里。
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    disabled={!room.history.length}
                    onClick={exportScores}
                  >
                    <Download size={14} />
                    导出全部成绩
                  </Button>
                </section>
                {t && (
                  <section className="panel play-log">
                    <h2>本桌行牌</h2>
                    <div className="log-list">
                      {[...t.log].reverse().map((l, i) => (
                        <div key={i}>
                          <strong>{pname(l.seat)}</strong>
                          <span>
                            {l.text}
                            {l.cards
                              ? ' · ' +
                                l.cards.map((c) => rankLabel(rank(c))).join(' ')
                              : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                <div className="privacy-note">
                  <ShieldCheck size={18} />
                  <p>
                    {team ? '另一桌的牌局在两桌结束后公开。' : ''}
                    刷新页面可恢复比赛，离开页面仍会正常计时。
                  </p>
                </div>
              </aside>
            </div>
          </>
        )}
        <footer className="site-footer">
          <span>♠ 牌局 · 好友相聚，公平较量</span>
          <a href="/rules" target="_blank">
            查看完整比赛规则
          </a>
        </footer>
      </main>
    </div>
  );
}
function LayersIcon() {
  return <Spade size={16} fill="currentColor" />;
}

function formatClock(ms: number) {
  const sec = Math.ceil(ms / 1000);
  return `${Math.floor(sec / 60)
    .toString()
    .padStart(2, '0')}:${(sec % 60).toString().padStart(2, '0')}`;
}
