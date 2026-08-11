'use client';

import { sensorHub } from '@/lib/sensors/hub';

/**
 * 심장 소리.
 *
 * 화면의 숫자와 파형은 "측정되고 있다"를 보여주지만, 그것이 **내 것**이라는
 * 감각까지 만들지는 못한다. 지금 뛰는 박자 그대로 소리가 나면 그때 바뀐다.
 * 부스에서 참가자가 처음으로 몸을 굳히는 순간이 이 소리가 시작될 때다.
 *
 * 규칙 하나: **박자는 지어내지 않는다.** 간격은 그 순간의 실측 HR에서만 온다.
 * 신호가 없으면 소리도 나지 않는다 — 없는 심장을 연주하지 않는다.
 */

/** 스케줄러 호출 주기(ms) */
const TICK_MS = 90;
/** 미리 예약해 두는 시간(초). 이보다 짧으면 탭 전환 후 박자가 튄다. */
const AHEAD_SEC = 0.28;
/** 마스터 게인 목표치. 부스 스피커에서 말소리를 덮지 않는 크기다. */
const MASTER_GAIN = 0.5;
/** 켜고 끌 때의 페이드(초). 뚝 끊기면 클릭 노이즈가 난다. */
const FADE_SEC = 0.35;
/** 이 범위를 벗어난 HR은 신호 이상으로 보고 소리를 내지 않는다 */
const HR_MIN = 35;
const HR_MAX = 190;

type Listener = (on: boolean) => void;

class Heartbeat {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;
  /** 다음 박동을 예약할 컨텍스트 시각(초) */
  private nextAt = 0;
  private enabled = false;
  private active = true;
  private listeners = new Set<Listener>();

  get on(): boolean {
    return this.enabled;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.enabled);
  }

  /**
   * 소리를 켠다. **반드시 클릭·탭 핸들러 안에서 불러야 한다** —
   * 사용자 제스처 없이 만든 AudioContext는 브라우저가 suspended로 둔다.
   */
  async enable(): Promise<boolean> {
    if (this.enabled) return true;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;

      if (!this.ctx) {
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0;
        this.master.connect(this.ctx.destination);
      }
      await this.ctx.resume();

      this.enabled = true;
      this.nextAt = this.ctx.currentTime + 0.12;
      this.applyGain();
      this.timer = window.setInterval(() => this.schedule(), TICK_MS);
      this.emit();
      return true;
    } catch {
      // 오디오는 체험의 부가 요소다. 실패해도 조용히 없던 일이 된다.
      this.enabled = false;
      return false;
    }
  }

  disable(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.enabled = false;
    this.applyGain();
    this.emit();
  }

  toggle(): void {
    if (this.enabled) this.disable();
    else void this.enable();
  }

  /**
   * 잠시 재운다. 끄는 것과 다르다 — 사용자의 "소리 켬" 선택은 그대로 두고
   * 소리만 멈춘다. 대화 씬에서 마이크에 심장 소리가 섞이지 않게 하는 용도다.
   */
  setActive(v: boolean): void {
    if (this.active === v) return;
    this.active = v;
    this.applyGain();
  }

  private applyGain(): void {
    if (!this.ctx || !this.master) return;
    const target = this.enabled && this.active ? MASTER_GAIN : 0;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(target, now + FADE_SEC);
  }

  /** 실측 HR에서 다음 박동들을 예약한다 */
  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;

    const hr = sensorHub.current().hr;
    if (hr === null || hr < HR_MIN || hr > HR_MAX) {
      // 신호가 없으면 박자를 지어내지 않고 기다린다
      this.nextAt = Math.max(this.nextAt, ctx.currentTime + 0.12);
      return;
    }

    const interval = 60 / hr;
    if (this.nextAt < ctx.currentTime) this.nextAt = ctx.currentTime + 0.02;

    while (this.nextAt < ctx.currentTime + AHEAD_SEC) {
      // 소리를 재우고 있을 때도 시간축은 계속 흘러야 한다 (다시 켤 때 박자가 안 튄다)
      if (this.active) this.beat(this.nextAt, interval);
      this.nextAt += interval;
    }
  }

  /** 한 박동 = 낮고 짧은 lub + 조금 높고 작은 dub */
  private beat(at: number, interval: number): void {
    const gap = Math.min(0.3, interval * 0.32);
    this.thump(at, 62, 34, 0.17, 1);
    this.thump(at + gap, 74, 44, 0.13, 0.55);
  }

  /**
   * 한 번의 두근.
   * 사인파의 주파수를 빠르게 떨어뜨리면 "퉁" 하는 타격음이 된다.
   * 샘플을 로드하지 않는 이유는 용량이 아니라 지연이다 — 부스에서 첫 박이 늦으면 안 된다.
   */
  private thump(at: number, f0: number, f1: number, dur: number, amp: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, at);
    osc.frequency.exponentialRampToValueAtTime(f1, at + dur * 0.8);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(amp, at + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    // 저역만 남겨 "쿵"에 가깝게. 없으면 사인파가 삐 소리처럼 들린다.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;

    osc.connect(env).connect(lp).connect(this.master);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }
}

export const heartbeat = new Heartbeat();
