export type RatingSample = {
  seat: number;
  role: 'landlord' | 'farmer';
  won: boolean;
  points: number;
  comparison?: number;
};
export type RatingBoard = {
  samples: RatingSample[];
  eligible: boolean;
  reason?: string;
};
export const RATING_BASE = 1000;
export const RATING_PRIOR = 8;
export const RATING_MIN_SAMPLES = 12;
export function calculateRatings(
  mode: 'team' | 'individual',
  players: { id: string; name: string; seat: number; bot: boolean }[],
  history: { rating?: RatingBoard }[],
  timeouts: Record<number, number> = {},
) {
  const boards = history
    .map((h) => h.rating)
    .filter((x): x is RatingBoard => !!x);
  const eligible = boards.filter((b) => b.eligible).flatMap((b) => b.samples);
  const baseRate = (role: RatingSample['role']) => {
    const xs = eligible.filter((x) => x.role === role);
    return xs.length ? xs.filter((x) => x.won).length / xs.length : 0.5;
  };
  const baseline = {
    landlord: baseRate('landlord'),
    farmer: baseRate('farmer'),
  };
  const entries = players.map((p) => {
    const samples = eligible.filter((s) => s.seat === p.seat);
    const n = samples.length;
    const sum = samples.reduce(
      (v, s) =>
        v +
        (mode === 'team'
          ? (s.comparison ?? 0)
          : Number(s.won) - baseline[s.role]),
      0,
    );
    return {
      id: p.id,
      name: p.name,
      seat: p.seat,
      bot: p.bot,
      score:
        !p.bot && n
          ? Math.round(RATING_BASE + (500 * sum) / (n + RATING_PRIOR))
          : null,
      samples: n,
      landlordSamples: samples.filter((s) => s.role === 'landlord').length,
      farmerSamples: samples.filter((s) => s.role === 'farmer').length,
      timeouts: timeouts[p.seat] || 0,
      provisional: n < RATING_MIN_SAMPLES,
    };
  });
  return {
    method: mode === 'team' ? '同牌对照表现分' : '角色校正表现分',
    baseline,
    entries,
    excludedBoards: history.length - boards.filter((b) => b.eligible).length,
  };
}
