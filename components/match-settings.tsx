'use client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import type { Settings } from '@/lib/game';
export const defaultSettings = (mode: Settings['mode'] = 'team'): Settings => ({
  mode,
  rounds: mode === 'team' ? 7 : 3,
  boards: 20,
  roundBoards: Array(mode === 'team' ? 7 : 3).fill(20),
  seconds: 30,
  teamMinutes: mode === 'team' ? 15 : 0,
  format: mode === 'team' ? 'best' : 'fixed',
});
export function MatchSettings({
  value,
  onChange,
}: {
  value: Settings;
  onChange: (value: Settings) => void;
}) {
  const update = (patch: Partial<Settings>) => onChange({ ...value, ...patch });
  return (
    <div className="match-settings-editor">
      <div className="form-grid settings-grid">
        <label>
          最多比赛局数
          <Input
            type="number"
            min={1}
            max={21}
            value={value.rounds}
            onChange={(e) => {
              const n = Number(e.target.value);
              update({
                rounds: n,
                ...(Number.isInteger(n) && n >= 1 && n <= 21
                  ? {
                      roundBoards: Array.from(
                        { length: n },
                        (_, i) => value.roundBoards[i] ?? value.boards,
                      ),
                    }
                  : {}),
              });
            }}
          />
        </label>
        <label>
          统一填写牌数
          <Input
            type="number"
            min={1}
            max={40}
            value={value.boards}
            onChange={(e) => update({ boards: Number(e.target.value) })}
          />
        </label>
        <label>
          每手上限
          <NativeSelect
            value={value.seconds}
            onChange={(e) => update({ seconds: Number(e.target.value) })}
          >
            {[15, 30, 60, 120].map((n) => (
              <option key={n} value={n}>
                {n} 秒
              </option>
            ))}
          </NativeSelect>
        </label>
        <label>
          胜负方式
          <NativeSelect
            value={value.format}
            disabled={value.mode === 'individual'}
            onChange={(e) =>
              update({ format: e.target.value as Settings['format'] })
            }
          >
            <option value="best">多数局获胜</option>
            <option value="fixed">最多局数</option>
          </NativeSelect>
        </label>
      </div>
      <div className="schedule-heading">
        <strong>逐局牌数</strong>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            update({ roundBoards: value.roundBoards.map(() => value.boards) })
          }
        >
          将 {value.boards || '—'} 副应用到各局
        </Button>
      </div>
      <div className="round-schedule">
        {value.roundBoards.map((n, i) => (
          <label key={i}>
            第 {i + 1} 局
            <Input
              aria-label={`第 ${i + 1} 局牌数`}
              type="number"
              min={1}
              max={40}
              value={n}
              onChange={(e) =>
                update({
                  roundBoards: value.roundBoards.map((x, j) =>
                    i === j ? Number(e.target.value) : x,
                  ),
                })
              }
            />
            <small>副</small>
          </label>
        ))}
      </div>
      {value.mode === 'team' ? (
        <>
          <label className="team-budget-input">
            每队每局总用时（分钟）
            <Input
              type="number"
              min={1}
              max={60}
              value={value.teamMinutes}
              onChange={(e) => update({ teamMinutes: Number(e.target.value) })}
            />
          </label>
          <p className="settings-help">
            每队两桌共享用时，用尽后每手 3 秒。每次平局加 1 副，双方各补 2
            分钟；新的一局重置用时。胜负已定就提前结束比赛。
          </p>
        </>
      ) : (
        <p className="settings-help">
          按逐局设置打满全部牌副，累计个人积分排名。个人赛使用每手上限。
        </p>
      )}
    </div>
  );
}
