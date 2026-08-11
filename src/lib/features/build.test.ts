import { describe, expect, it } from 'vitest';
import { SessionRecorder } from '@/lib/session/recorder';
import { buildLlmInput } from './build';
import { ruleBasedReceipt } from '@/lib/interpret/fallback';
import { BioReceiptSchema } from '@/lib/interpret/schema';

/**
 * 부록 C 검수 체크리스트 중 **기계적으로 확인 가능한 항목**을 테스트로 고정한다.
 * 나머지(문장 품질, 추천 안정성)는 리허설에서 사람이 본다.
 *
 * 특히 2번 항목이 중요하다:
 *   "결측 데이터를 넣었을 때 그 축을 조용히 건너뛰는가, 아니면 지어내는가"
 */

function emptyRecorder(): SessionRecorder {
  return new SessionRecorder();
}

/** 신호는 있지만 과제 기록이 없는 경우 (센서만 붙이고 체험을 건너뛴 상태) */
function signalOnlyRecorder(): SessionRecorder {
  const r = new SessionRecorder();
  r.enterScene('S2', 0);
  for (let t = 0; t < 60000; t += 40) {
    r.pushHr(t, 72 + Math.sin(t / 1200) * 3);
    r.pushGsr(t, 5 + Math.sin(t / 9000) * 0.2);
    if (t % 840 === 0) r.pushRr(t, 830 + ((t / 840) % 7) * 12);
  }
  r.enterScene('S3', 60000);
  return r;
}

describe('부록 C Input 조립', () => {
  it('빈 세션에서도 모든 블록이 존재한다 (키를 생략하지 않는다)', () => {
    const { input } = buildLlmInput(emptyRecorder(), {
      sessionId: '20260811-A-000',
      settled: false,
      settleTimeSec: null,
    });

    // 부록 C: "결측 항목은 키를 생략하지 말고 null + quality: missing으로 명시한다"
    expect(input).toHaveProperty('baseline');
    expect(input).toHaveProperty('calm_phase');
    expect(input).toHaveProperty('gaze');
    expect(input).toHaveProperty('drawing');
    expect(input).toHaveProperty('dialogue');
    expect(input).toHaveProperty('cross_check');

    expect(input.baseline.quality).toBe('missing');
    expect(input.baseline.hr_mean).toBeNull();
    expect(input.gaze.quality).toBe('missing');
    expect(input.gaze.riasec).toBeNull();
    expect(input.drawing.quality).toBe('missing');
    expect(input.drawing.axes).toBeNull();
    expect(input.dialogue).toEqual([]);
    expect(input.cross_check.gaze_vs_speech_riasec.agree).toBeNull();
  });

  it('없는 값을 0이나 빈 문자열로 메우지 않는다', () => {
    const { input } = buildLlmInput(emptyRecorder(), {
      sessionId: '20260811-A-000',
      settled: false,
      settleTimeSec: null,
    });
    expect(input.baseline.hrv_rmssd).toBeNull();
    expect(input.baseline.gsr_scl_mean).toBeNull();
    expect(input.drawing.observations).toBeNull();
    expect(input.drawing.future_sketch).toBeNull();
    expect(input.calm_phase.settle_time_sec).toBeNull();
  });

  it('신호가 있으면 베이스라인이 채워지고 나머지는 결측으로 남는다', () => {
    const { input } = buildLlmInput(signalOnlyRecorder(), {
      sessionId: '20260811-A-001',
      settled: true,
      settleTimeSec: 24.5,
    });
    expect(input.baseline.quality).toBe('ok');
    expect(input.baseline.hr_mean).toBeGreaterThan(60);
    expect(input.baseline.hr_mean).toBeLessThan(90);
    expect(input.baseline.hrv_rmssd).not.toBeNull();
    expect(input.calm_phase.reached).toBe(true);
    expect(input.calm_phase.settle_time_sec).toBe(24.5);

    // 과제를 하지 않았으므로 이 축들은 여전히 결측이어야 한다
    expect(input.gaze.quality).toBe('missing');
    expect(input.drawing.quality).toBe('missing');
  });

  it('시선이 프록시면 degraded로 표시된다 — 실기기인 척하지 않는다', () => {
    const r = signalOnlyRecorder();
    r.gazeTrials.push({
      pairId: 1,
      flipped: false,
      onset: 1000,
      offset: 7000,
      samples: Array.from({ length: 60 }, (_, i) => ({
        t: 1000 + i * 100,
        x: 0.25,
        y: 0.5,
        c: 1,
      })),
    });
    const { input } = buildLlmInput(r, {
      sessionId: '20260811-A-002',
      settled: false,
      settleTimeSec: null,
      gazeDegraded: true,
    });
    expect(input.gaze.quality).toBe('degraded');
    expect(input.gaze.riasec).not.toBeNull();
  });

  it('session_id가 그대로 실린다', () => {
    const { input } = buildLlmInput(emptyRecorder(), {
      sessionId: '20260811-A-042',
      settled: false,
      settleTimeSec: null,
    });
    expect(input.session_id).toBe('20260811-A-042');
  });
});

describe('결측 입력 → 영수증 (부스 최악의 경우)', () => {
  /**
   * 센서가 하나도 안 붙고 과제도 전부 건너뛴 상태에서 영수증을 뽑아본다.
   * 이래도 스키마를 만족하는 종이가 나와야 한다. 빈손으로 돌려보내지 않는다.
   */
  it('아무 데이터가 없어도 유효한 영수증이 나온다', () => {
    const { input } = buildLlmInput(emptyRecorder(), {
      sessionId: '20260811-A-000',
      settled: false,
      settleTimeSec: null,
    });
    const parsed = BioReceiptSchema.safeParse(ruleBasedReceipt(input));
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('데이터가 없으면 있는 척하는 근거를 만들지 않는다', () => {
    const { input } = buildLlmInput(emptyRecorder(), {
      sessionId: '20260811-A-000',
      settled: false,
      settleTimeSec: null,
    });
    const r = ruleBasedReceipt(input);
    // 시선·그림·대화 어느 축도 없으므로 그 경로를 근거로 든 문장이 있으면 안 된다
    for (const e of r.evidence) {
      expect(e.source.startsWith('gaze.traits')).toBe(false);
      expect(e.source.startsWith('drawing.')).toBe(false);
      expect(e.source.startsWith('dialogue[')).toBe(false);
    }
    expect(r.hidden_finding).toBeNull();
  });
});
