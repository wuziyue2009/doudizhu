import { RATING_BASE, RATING_PRIOR, RATING_MIN_SAMPLES } from '@/lib/ratings';
export function RatingRules() {
  return (
    <section className="panel rating-rules" id="rating-rules">
      <span className="eyebrow">PERFORMANCE, WITH CONTEXT</span>
      <h2>赛后表现分，怎样计算？</h2>
      <p>
        比赛结束后公布每位选手的表现分、有效副数和超时次数。基准为 {RATING_BASE}{' '}
        分，样本越少，分数越接近基准。
      </p>
      <div className="rating-formula">
        表现分 = 四舍五入［1000 + 500 × 有效表现之和 ÷（有效副数 +{' '}
        {RATING_PRIOR}）］
      </div>
      <details>
        <summary>查看公平性原则和完整算法</summary>
        <div className="rating-rule-details">
          <h3>复式团体赛：同牌、同角色对照</h3>
          <p>
            只统计两桌地主位置相同、对应座位拿到相同手牌且角色相同的牌副。每位上场选手与另一桌对应座位比较：该选手所在阵营赢记
            +P，输记 −P，P 为本桌原始分值。每副有效表现 =（本人有符号分值 −
            对照选手有符号分值）÷［2 × 两桌较大的 P］。结果在 −1 到 +1
            之间，对照双方一增一减；闲家不记样本。
          </p>
          <h3>三人个人赛：按地主与农民分别校正</h3>
          <p>
            先统计本场有效牌副的地主、农民胜率，作为各角色基准。每副有效表现 =
            本人阵营胜负（赢 1、输 0）− 本人角色的全场基准胜率。例如地主基准胜率
            40%，当地主获胜记 +0.6，落败记
            −0.4。炸弹倍数不额外放大个人赛表现分。
          </p>
          <h3>样本与适用范围</h3>
          <p>
            含电脑陪练的整副牌不参与评级；团体赛两桌角色不同、旧记录缺少数据时也不计有效样本。没有有效样本显示“未评级”。不足{' '}
            {RATING_MIN_SAMPLES}{' '}
            副标为“样本不足”，同分并列。超时副仍计入，另公开超时次数，避免靠故意超时规避失分。
          </p>
          <p>
            这是本场表现参考，不能完全消除牌运、对手强弱和搭档配合的影响；合作农民无法仅靠胜负拆分个人贡献。它不是跨比赛累计的职业段位，两种模式的分数不直接比较。
          </p>
        </div>
      </details>
    </section>
  );
}
