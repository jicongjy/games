// Cloudflare Worker: 방 코드 하나가 Durable Object 하나. 규칙 판정은 모두 서버에서 한다.
import { DurableObject } from 'cloudflare:workers';
import { createRoom, join, act, rematch, setConnected, payload, timeout, GRACE_MS } from './room-logic.js';

const CODE_RE = /^[A-Z2-9]{4,6}$/;
const MAX_MESSAGE = 2048;
const IDLE_MS = 6 * 60 * 60 * 1000; // 6시간 동안 아무 일 없으면 방 삭제

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get('room')) ?? createRoom();
    });
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('websocket only', { status: 426 });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    const att = ws.deserializeAttachment() || {};
    if (msg.t === 'join') {
      const r = join(this.room, { token: msg.token, name: msg.name, courses: msg.courses, turnSeconds: msg.turnSeconds });
      if (!r.ok) { this.send(ws, { t: 'error', fatal: true, error: r.error }); return; }
      ws.serializeAttachment({ seat: r.seat });
      await this.save();
      this.broadcast();
      return;
    }
    if (att.seat === undefined) { this.send(ws, { t: 'error', fatal: true, error: '먼저 입장해야 해요' }); return; }

    if (msg.t === 'act') {
      const r = act(this.room, att.seat, msg.action);
      if (!r.ok) { this.send(ws, { t: 'error', error: r.error }); return; }
    } else if (msg.t === 'rematch') {
      const r = rematch(this.room, att.seat);
      if (!r.ok) { this.send(ws, { t: 'error', error: r.error }); return; }
    } else if (msg.t === 'ping') {
      this.send(ws, { t: 'pong' });
      return;
    } else {
      return;
    }
    await this.save();
    this.broadcast();
  }

  async webSocketClose(ws) { await this.dropped(ws); }
  async webSocketError(ws) { await this.dropped(ws); }

  async dropped(ws) {
    const att = ws.deserializeAttachment();
    if (!att || att.seat === undefined) return;
    // 같은 자리로 새 소켓이 이미 붙었다면 연결 끊김으로 보지 않는다
    const stillThere = this.ctx.getWebSockets().some((s) => s !== ws && (s.deserializeAttachment() || {}).seat === att.seat);
    if (!stillThere) {
      setConnected(this.room, att.seat, false);
      await this.save();
      this.broadcast();
    }
  }

  async alarm() {
    const now = Date.now();
    // 알람은 하나뿐이라 "차례 마감"과 "방 정리"를 함께 쓴다
    if (this.room.status === 'playing' && this.room.deadline) {
      if (timeout(this.room, now)) { await this.save(); this.broadcast(); return; }
      if (now < (this.room.idleAt ?? 0)) { await this.schedule(); return; }
    }
    for (const ws of this.ctx.getWebSockets()) { try { ws.close(1000, 'room expired'); } catch { /* 이미 닫힘 */ } }
    await this.ctx.storage.deleteAll();
    this.room = createRoom();
  }

  async save() {
    this.room.idleAt = Date.now() + IDLE_MS;
    await this.ctx.storage.put('room', this.room);
    await this.schedule();
  }

  async schedule() {
    const r = this.room;
    const at = r.status === 'playing' && r.deadline ? Math.min(r.deadline + GRACE_MS, r.idleAt) : r.idleAt;
    await this.ctx.storage.setAlarm(at);
  }

  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch { /* 끊긴 소켓 */ } }

  broadcast() {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (att && att.seat !== undefined) this.send(ws, payload(this.room, att.seat));
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/ws\/([A-Za-z0-9]+)$/);
    if (!m) return new Response('hansang server', { status: 200 });

    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (origin && !allowed.includes(origin)) return new Response('forbidden origin', { status: 403 });

    const code = m[1].toUpperCase();
    if (!CODE_RE.test(code)) return new Response('bad room code', { status: 400 });
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    return stub.fetch(request);
  },
};
