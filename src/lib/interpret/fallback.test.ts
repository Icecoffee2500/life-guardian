import { describe, expect, it } from 'vitest';
import type { LlmInput } from '@/lib/features/schema';
import { BioReceiptSchema } from './schema';
import { ruleBasedReceipt } from './fallback';

function input(over: Partial<LlmInput> = {}): LlmInput {
  return {
    session_id: '20260811-A-001',
    baseline: { hr_mean: 72.4, hrv_rmssd: 41.2, gsr_scl_mean: 5.3, quality: 'ok' },
    calm_phase: { reached: true, settle_time_sec: 24.5 },
    gaze: {
      riasec: { R: -0.2, I: 0.7, A: 0.5, S: -0.4, E: -0.6, C: 0.1 },
      traits: {
        개방성: 0.6,
        사회적_에너지: -0.5,
        환경_가치: 0.4,
        모험_가치: -0.3,
        소비_가치: -0.7,
        무질서_회피: 0.8,
      },
      high_arousal_pairs: [{ pair: 10, 선택: '아늑한 집 거실', arousal_z: 1.6 }],
      quality: 'ok',
    },
    drawing: {
      axes: { 개방성: 2, 안정지향: 3, 표현욕구: 1, 완벽주의: 3 },
      observations: {
        크기: '소',
        위치: '좌측',
        필압: '강',
        수정횟수: 4,
        세부요소: 2,
        착수지연_sec: 9,
      },
      arousal_peaks: ['그리기 시작할 때'],
      future_sketch: null,
      quality: 'ok',
    },
    dialogue: [
      {
        q: 0,
        topic: '발화 baseline',
        transcript: '지하철 타고 왔어요',
        latency_sec: 1.2,
        words: 3,
        content_valence: null,
        arousal_z: null,
        mismatch: null,
      },
      {
        q: 4,
        topic: '다음 챕터',
        transcript: '조용한 실험실이요',
        latency_sec: 4.8,
        words: 2,
        content_valence: 0.8,
        arousal_z: 1.9,
        mismatch: 1.1,
        서사차원: { 주도성: 2, 관계성: 1, 낙관: 3 },
      },
    ],
    cross_check: { gaze_vs_speech_riasec: { gaze_top: 'I', speech_top: 'A', agree: false } },
    ...over,
  };
}

/** 결측 투성이 입력 — 센서가 하나도 안 붙은 최악의 경우 */
function emptyInput(): LlmInput {
  return input({
    baseline: { hr_mean: null, hrv_rmssd: null, gsr_scl_mean: null, quality: 'missing' },
    calm_phase: { reached: false, settle_time_sec: null },
    gaze: { riasec: null, traits: null, high_arousal_pairs: [], quality: 'missing' },
    drawing: {
      axes: null,
      observations: null,
      arousal_peaks: [],
      future_sketch: null,
      quality: 'missing',
    },
    dialogue: [],
    cross_check: { gaze_vs_speech_riasec: { gaze_top: null, speech_top: null, agree: null } },
  });
}

describe('규칙 기반 폴백', () => {
  /** 이것이 이 파일의 존재 이유다 — 키 없이도 영수증이 나와야 한다 */
  it('부록 C 출력 스키마를 만족한다', () => {
    expect(BioReceiptSchema.safeParse(ruleBasedReceipt(input())).success).toBe(true);
  });

  it('입력이 전부 결측이어도 스키마를 만족한다', () => {
    const r = BioReceiptSchema.safeParse(ruleBasedReceipt(emptyInput()));
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it('결측 입력에서는 성향을 지어내지 않는다', () => {
    const r = ruleBasedReceipt(emptyInput());
    // 시선 축이 없으므로 시선 근거를 든 문장이 있으면 안 된다
    expect(r.evidence.some((e) => e.source.startsWith('gaze.traits'))).toBe(false);
    expect(r.unconscious_summary.length).toBeGreaterThanOrEqual(2);
  });

  it('모든 요약 문장에 대응하는 근거가 있다', () => {
    const r = ruleBasedReceipt(input());
    for (const s of r.unconscious_summary) {
      expect(r.evidence.some((e) => e.claim === s || s.startsWith(e.claim.slice(0, 12)))).toBe(true);
    }
  });

  it('불일치가 임계 미만이면 hidden_finding을 만들지 않는다', () => {
    const low = input({
      dialogue: [
        {
          q: 4,
          topic: '다음 챕터',
          transcript: '조용한 실험실이요',
          latency_sec: 4.8,
          words: 2,
          content_valence: 0.2,
          arousal_z: 0.1,
          mismatch: 0.1,
        },
      ],
    });
    expect(ruleBasedReceipt(low).hidden_finding).toBeNull();
  });

  it('불일치가 크면 hidden_finding과 그 근거가 함께 나온다', () => {
    const r = ruleBasedReceipt(input());
    expect(r.hidden_finding).not.toBeNull();
    expect(r.evidence.some((e) => e.source.includes('mismatch'))).toBe(true);
  });

  it('내향 신호에서는 혼자 하는 퀘스트를 준다', () => {
    expect(ruleBasedReceipt(input()).tuning_quest).toContain('혼자');
  });

  it('외향 신호에서는 사람을 향한 퀘스트를 준다', () => {
    const extro = input();
    extro.gaze.traits!.사회적_에너지 = 0.7;
    expect(ruleBasedReceipt(extro).tuning_quest).toContain('연락');
  });

  it('단정형·진단 용어를 쓰지 않는다', () => {
    // disclaimer는 "진단이 아닙니다"라고 말해야 하므로 검사에서 제외한다
    const banned = ['우울', '불안장애', '성격장애', '치료', '증후군', '당신은 내향', '당신은 외향'];
    const { disclaimer, ...rest } = ruleBasedReceipt(input());
    expect(disclaimer).toContain('진단이 아닙니다');
    const text = JSON.stringify(rest);
    for (const w of banned) expect(text.includes(w), w).toBe(false);
  });

  it('영수증 폭 제약(문장 길이)을 지킨다', () => {
    const r = ruleBasedReceipt(input());
    expect(r.persona_name.length).toBeLessThanOrEqual(12);
    expect(r.one_liner.length).toBeLessThanOrEqual(32);
    for (const s of r.unconscious_summary) expect(s.length).toBeLessThanOrEqual(48);
    expect(r.tuning_quest.length).toBeLessThanOrEqual(60);
  });

  it('상위 유형이 바뀌면 추천도 바뀐다', () => {
    const a = ruleBasedReceipt(input());
    const b = input();
    b.gaze.riasec = { R: 0.1, I: -0.5, A: -0.2, S: 0.8, E: 0.6, C: 0 };
    expect(ruleBasedReceipt(b).recommendations.직업[0].name).not.toBe(
      a.recommendations.직업[0].name,
    );
  });
});
