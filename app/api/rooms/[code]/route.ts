import { identity, respond, readRoom, saveRoom, readBody } from '@/lib/store';
import { applyAction, publicRoom, tick, type Action } from '@/lib/game';
type Context = { params: Promise<{ code: string }> };
export async function GET(req: Request, ctx: Context) {
  const auth = await identity(req);
  const code = (await ctx.params).code.toUpperCase();
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const record = await readRoom(code);
      if (!record)
        return respond(
          { error: '没有找到这个房间，请核对邀请链接' },
          404,
          auth.cookie,
        );
      const { room, revision } = record;
      if (tick(room)) {
        if (!(await saveRoom(room, revision))) continue;
        return respond(
          publicRoom(room, auth.session, revision + 1),
          200,
          auth.cookie,
        );
      }
      return respond(
        publicRoom(room, auth.session, revision),
        200,
        auth.cookie,
      );
    }
    return respond({ error: '房间正在同步，请稍后重试' }, 409, auth.cookie);
  } catch (e) {
    console.error('read room', e);
    return respond(
      { error: '连接比赛服务失败，正在等待重连' },
      503,
      auth.cookie,
    );
  }
}
export async function POST(req: Request, ctx: Context) {
  const auth = await identity(req);
  const code = (await ctx.params).code.toUpperCase();
  try {
    const action = (await readBody(req)) as Action;
    for (let attempt = 0; attempt < 8; attempt++) {
      const record = await readRoom(code);
      if (!record) return respond({ error: '房间不存在' }, 404, auth.cookie);
      const { room, revision } = record;
      const now = Date.now();
      if (tick(room, now)) {
        await saveRoom(room, revision);
        continue;
      }
      const player = room.players.find((p) => p.session === auth.session);
      if (action.type === 'play' || action.type === 'bid') {
        const t = room.tables.find(
          (t) => player && t.seats.includes(player.seat),
        );
        if (
          !t ||
          action.expected !==
            `${room.round}:${room.board}:${t.log.length}:${t.turn}`
        )
          return respond(
            { error: '牌局已更新，请根据当前手牌重新操作' },
            409,
            auth.cookie,
          );
      }
      if (
        action.type === 'next' &&
        action.expected !== `${room.round}:${room.board}:${room.status}`
      )
        return respond({ error: '已进入下一副，请刷新牌局' }, 409, auth.cookie);
      applyAction(room, auth.session, action, now);
      if (await saveRoom(room, revision))
        return respond(
          publicRoom(room, auth.session, revision + 1),
          200,
          auth.cookie,
        );
    }
    return respond({ error: '其他选手正在操作，请重试' }, 409, auth.cookie);
  } catch (e) {
    return respond(
      {
        error:
          e instanceof Error && !/D1|SQLITE/i.test(e.message)
            ? e.message
            : '操作失败，请稍后重试',
      },
      400,
      auth.cookie,
    );
  }
}
