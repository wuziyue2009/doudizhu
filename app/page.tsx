'use client';
import { useState } from 'react';
import {
  Trophy,
  Users,
  ArrowRight,
  Plus,
  Spade,
  Link,
  ShieldCheck,
  Layers,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MatchSettings, defaultSettings } from '@/components/match-settings';
import { RatingRules } from '@/components/rating-rules';
export default function Home() {
  const [config, setConfig] = useState(defaultSettings());
  const { mode, rounds, format } = config;
  const [name, setName] = useState(''),
    [title, setTitle] = useState('周末好友赛'),
    [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, title, ...config }),
      });
      const d = (await r.json()) as { code: string; error?: string };
      if (!r.ok) throw Error(d.error || '创建失败');
      window.location.href = '/room/' + d.code;
    } catch (e) {
      setError(e instanceof Error ? e.message : '连接失败，请重试');
      setBusy(false);
    }
  }
  function join() {
    const m = code.trim().match(/(?:room\/)?([A-Za-z0-9]{8})(?:[/?#].*)?$/);
    if (!m) {
      setError('请输入 8 位房间码或完整邀请链接');
      return;
    }
    window.location.href = '/room/' + m[1].toUpperCase();
  }
  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Spade size={23} fill="currentColor" />
          </span>
          <strong>牌局</strong>
          <span className="brand-sub">好友竞技场</span>
        </a>
        <nav>
          <a href="#rating-rules">评分规则</a>
          <a href="/rules">比赛规则</a>
          <span className="live-tag">
            <i />
            在线联机
          </span>
        </nav>
      </header>
      <main className="lobby">
        <div className="page-heading">
          <div>
            <span className="eyebrow">PLAY TOGETHER. PLAY YOUR WAY.</span>
            <h1>
              你的比赛，你来开场<span>。</span>
            </h1>
            <p>组队较量，或三人切磋。创建房间，把好朋友请上牌桌。</p>
          </div>
          <span className="heading-spade">♠</span>
        </div>
        <div className="lobby-grid">
          <section className="panel create-panel">
            <div className="section-title">
              <span className="icon-box">
                <Plus />
              </span>
              <div>
                <h2>创建比赛</h2>
                <p>设置赛制，邀请好友一起加入</p>
              </div>
              <span className="step-tag">01 / 开场</span>
            </div>
            <div className="mode-grid">
              {[
                {
                  id: 'team',
                  icon: <Users />,
                  num: (
                    <>
                      4 <small>vs</small> 4
                    </>
                  ),
                  label: '复式团体赛',
                  desc: '同牌双桌 · 固定搭档 · 团队计分',
                },
                {
                  id: 'individual',
                  icon: <Spade />,
                  num: (
                    <>
                      3 <small>人</small>
                    </>
                  ),
                  label: '三人个人赛',
                  desc: '轮流叫分 · 个人积分 · 总分排名',
                },
              ].map((m) => (
                <button
                  key={m.id}
                  className={'mode-card ' + (mode === m.id ? 'active' : '')}
                  onClick={() => {
                    setConfig(defaultSettings(m.id as 'team' | 'individual'));
                  }}
                >
                  {m.icon}
                  <span className="mode-number">{m.num}</span>
                  <strong>{m.label}</strong>
                  <p>{m.desc}</p>
                  <span className="radio-dot" />
                </button>
              ))}
            </div>
            <div className="form-grid">
              <label>
                你的昵称
                <Input
                  maxLength={16}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="大家怎么称呼你？"
                />
              </label>
              <label>
                比赛名称
                <Input
                  maxLength={30}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
            </div>
            <div className="form-divider">
              <SlidersHorizontal size={15} />
              赛制设置
            </div>
            <MatchSettings value={config} onChange={setConfig} />
            <div className="setting-summary">
              <Trophy size={17} />
              {mode === 'team'
                ? format === 'best'
                  ? `${rounds} 局 ${Math.floor(rounds / 2) + 1} 胜`
                  : `最多 ${rounds} 局，胜负已定即止`
                : `${rounds} 局累计个人积分`}
              <span>·</span>各局共{' '}
              {config.roundBoards.reduce((a, b) => a + b, 0)} 副（不含加赛）
            </div>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <Button
              className="primary-action"
              onClick={create}
              disabled={busy || !name.trim()}
            >
              {busy ? '正在创建…' : '创建比赛房间'}
              <ArrowRight size={18} />
            </Button>
            <p className="form-note">无需注册 · 房主可在开赛前调整设置</p>
          </section>
          <aside className="side-stack">
            <section className="panel join-panel">
              <span className="eyebrow">ALREADY INVITED?</span>
              <h2>好友在等你</h2>
              <p>输入房间码，直接加入比赛。</p>
              <label className="sr-only" htmlFor="join-code">
                房间码或邀请链接
              </label>
              <Input
                id="join-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && join()}
                placeholder="8 位房间码 / 邀请链接"
              />
              <Button variant="outline" className="join-action" onClick={join}>
                <Link size={16} />
                加入房间
                <ArrowRight size={16} />
              </Button>
            </section>
            <section className="field-note">
              <div className="tiny-label">THE DUPLICATE GAME</div>
              <h3>
                同样的牌，
                <br />
                不同的精彩。
              </h3>
              <p>
                两桌使用完全相同的牌，比较每一副的团队净分。叫牌、配合和每一次出手，都能改变比分。
              </p>
              <div className="note-line">
                <Layers size={18} />
                <span>A 桌 + B 桌 = 团队净分</span>
              </div>
            </section>
            <div className="privacy-note">
              <ShieldCheck size={19} />
              <p>
                手牌仅本人可见。邀请链接交给参赛好友，即可在各自的设备上比赛。
              </p>
            </div>
          </aside>
        </div>
        <RatingRules />
        <footer className="site-footer">
          <span>♠ 牌局 · 让每一次相聚都有好牌</span>
          <a href="/rules">
            了解本站规则 <ArrowRight size={13} />
          </a>
        </footer>
      </main>
    </div>
  );
}
