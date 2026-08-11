import { describe, expect, it } from 'vitest';
import type { DialogueTurn } from '@/lib/session/recorder';
import {
  MISMATCH_THRESHOLD,
  arousalZScores,
  buildDialogueBlocks,
  narrativeDimensions,
  ruleBasedValence,
  topMismatch,
  turnArousal,
  wordCount,
} from './dialogue';
import type { TimePoint } from './signal';

function turn(p: Partial<DialogueTurn> & { q: number }): DialogueTurn {
  const readEndT = p.readEndT ?? 0;
  return {
    q: p.q,
    topic: p.topic ?? `주제${p.q}`,
    readEndT,
    speechStartT: p.speechStartT === null ? null : (p.speechStartT ?? readEndT + 1500),
    endT: p.endT ?? readEndT + 20000,
    transcript: p.transcript ?? '적당한 길이의 답변입니다',
    noResponse: p.noResponse ?? false,
  };
}

/** 지정한 시각들에 상승이 있는 GSR */
function gsrWithBumps(bumps: { at: number; amp: number }[], untilMs = 200000): TimePoint[] {
  const out: TimePoint[] = [];
  for (let t = 0; t <= untilMs; t += 40) {
    let v = 5;
    for (const b of bumps) {
      const dt = (t - b.at) / 1000;
      if (dt > 0.8 && dt < 6) v += b.amp * Math.exp(-((dt - 2) ** 2) / 2);
    }
    out.push({ t, v });
  }
  return out;
}

function flatHr(untilMs = 200000): TimePoint[] {
  const out: TimePoint[] = [];
  for (let t = 0; t <= untilMs; t += 40) out.push({ t, v: 72 });
  return out;
}

describe('어절 수', () => {
  it('공백 단위로 센다', () => {
    expect(wordCount('오늘 여기까지 어떻게 오셨어요')).toBe(4);
    expect(wordCount('  ')).toBe(0);
    expect(wordCount('')).toBe(0);
  });
});

describe('규칙 기반 정서가', () => {
  it('긍정 어휘가 많으면 양수', () => {
    expect(ruleBasedValence('정말 좋았고 기대가 됩니다')).toBeGreaterThan(0);
  });
  it('부정 어휘가 많으면 음수', () => {
    expect(ruleBasedValence('많이 힘들고 불안했어요')).toBeLessThan(0);
  });
  it('근거가 없으면 0', () => {
    expect(ruleBasedValence('지하철 타고 왔습니다')).toBe(0);
    expect(ruleBasedValence('')).toBe(0);
  });
  it('항상 -1~+1 범위', () => {
    const v = ruleBasedValence('좋고 행복하고 기대되고 재미있고 편하고 설레고 감사합니다');
    expect(v).toBeLessThanOrEqual(1);
    expect(v).toBeGreaterThanOrEqual(-1);
  });
});

describe('생체 각성', () => {
  it('발화 시점 이후의 SCR 상승을 잡는다', () => {
    const t = turn({ q: 1, readEndT: 10000, speechStartT: 11500, endT: 30000 });
    const a = turnArousal(t, gsrWithBumps([{ at: 11500, amp: 2 }]), flatHr());
    expect(a.scr).toBeGreaterThan(1);
  });

  it('상승이 없으면 각성도 거의 0', () => {
    const t = turn({ q: 1, readEndT: 10000, speechStartT: 11500, endT: 30000 });
    const a = turnArousal(t, gsrWithBumps([]), flatHr());
    expect(Math.abs(a.scr)).toBeLessThan(0.05);
  });

  it('기준선 문항(q=0)의 z는 정의상 0이다', () => {
    const zs = arousalZScores([
      { q: 0, scr: 1, hrDelta: 0, raw: 1 },
      { q: 1, scr: 2, hrDelta: 0, raw: 2 },
      { q: 2, scr: 3, hrDelta: 0, raw: 3 },
    ]);
    expect(zs.get(0)).toBe(0);
  });

  it('문항이 하나뿐이면 표준편차를 못 구하므로 0으로 둔다', () => {
    const zs = arousalZScores([
      { q: 0, scr: 1, hrDelta: 0, raw: 1 },
      { q: 1, scr: 5, hrDelta: 0, raw: 5 },
    ]);
    expect(zs.get(1)).toBe(0);
  });

  it('가장 크게 반응한 문항의 z가 가장 크다', () => {
    const zs = arousalZScores([
      { q: 0, scr: 0, hrDelta: 0, raw: 0.5 },
      { q: 1, scr: 0, hrDelta: 0, raw: 0.6 },
      { q: 2, scr: 0, hrDelta: 0, raw: 0.7 },
      { q: 4, scr: 0, hrDelta: 0, raw: 3.2 },
    ]);
    expect(zs.get(4)!).toBeGreaterThan(zs.get(1)!);
    expect(zs.get(4)!).toBeGreaterThan(1);
  });

  /**
   * 중심이 문항 평균이 아니라 문항 0이어야 한다.
   * 평균을 중심으로 잡으면 조용했던 문항이 큰 음수 z를 받고,
   * 그 문항이 |정서가 − 각성|에서 최대 불일치로 뽑히는 역전이 생긴다.
   */
  it('기준선과 같은 수준으로 반응한 문항의 z는 0 근처다', () => {
    const zs = arousalZScores([
      { q: 0, scr: 0, hrDelta: 0, raw: 1.0 },
      { q: 1, scr: 0, hrDelta: 0, raw: 1.0 },
      { q: 4, scr: 0, hrDelta: 0, raw: 4.0 },
    ]);
    expect(Math.abs(zs.get(1)!)).toBeLessThan(0.1);
    expect(zs.get(4)!).toBeGreaterThan(1);
  });
});

describe('서사 차원 (문항 4)', () => {
  it('주도·관계·낙관 어휘를 각각 3점 척도로 코딩한다', () => {
    const nd = narrativeDimensions('제가 직접 팀을 만들고 사람들과 함께 잘 해내면 좋겠어요');
    expect(nd!.주도성).toBe(3);
    expect(nd!.관계성).toBe(3);
    expect(nd!.낙관).toBeGreaterThanOrEqual(2);
  });

  it('근거가 없으면 전부 1점', () => {
    const nd = narrativeDimensions('음 잘 모르겠네요');
    // '잘'은 낙관 어휘라 낙관만 오른다
    expect(nd!.주도성).toBe(1);
    expect(nd!.관계성).toBe(1);
  });

  it('빈 발화면 코딩하지 않는다', () => {
    expect(narrativeDimensions('')).toBeUndefined();
  });
});

describe('dialogue 블록', () => {
  const turns = [
    turn({ q: 0, readEndT: 0, speechStartT: 1200, endT: 20000, transcript: '지하철 타고 왔어요' }),
    turn({
      q: 1,
      readEndT: 30000,
      speechStartT: 32400,
      endT: 50000,
      transcript: '닮고 싶은 선생님이 있었어요 침착한 분이었습니다',
    }),
    turn({
      q: 4,
      readEndT: 60000,
      speechStartT: 64800,
      endT: 80000,
      transcript: '다음 챕터는 좋겠어요 제가 직접 만들고 사람들과 함께요',
    }),
  ];

  it('지연시간은 낭독 종료부터 발화 시작까지다', () => {
    const b = buildDialogueBlocks(turns, gsrWithBumps([]), flatHr());
    expect(b[1].latency_sec).toBeCloseTo(2.4, 1);
    expect(b[2].latency_sec).toBeCloseTo(4.8, 1);
  });

  it('기준선 문항은 각성·불일치를 계산하지 않는다', () => {
    const b = buildDialogueBlocks(turns, gsrWithBumps([]), flatHr());
    expect(b[0].arousal_z).toBeNull();
    expect(b[0].mismatch).toBeNull();
  });

  it('불일치는 |정서가 − 각성|이다', () => {
    const b = buildDialogueBlocks(turns, gsrWithBumps([{ at: 64800, amp: 3 }]), flatHr(), {
      valences: new Map([
        [1, 0.5],
        [4, 0.8],
      ]),
    });
    const q4 = b.find((x) => x.q === 4)!;
    expect(q4.content_valence).toBeCloseTo(0.8, 5);
    expect(q4.mismatch).toBeCloseTo(Math.abs(0.8 - q4.arousal_z!), 2);
  });

  it('밝게 말했는데 몸이 크게 반응하면 불일치가 커진다 — 이 세션의 핵심 산출물', () => {
    const b = buildDialogueBlocks(turns, gsrWithBumps([{ at: 64800, amp: 4 }]), flatHr(), {
      valences: new Map([
        [1, 0.4],
        [4, 0.9],
      ]),
    });
    const q4 = b.find((x) => x.q === 4)!;
    const q1 = b.find((x) => x.q === 1)!;
    expect(q4.mismatch!).toBeGreaterThan(q1.mismatch!);
    expect(topMismatch(b)?.q).toBe(4);
  });

  it('무응답이면 정서가를 만들지 않는다', () => {
    const b = buildDialogueBlocks(
      [turn({ q: 1, transcript: '', noResponse: true, speechStartT: null })],
      gsrWithBumps([]),
      flatHr(),
    );
    expect(b[0].content_valence).toBeNull();
    expect(b[0].mismatch).toBeNull();
    expect(b[0].latency_sec).toBeNull();
    expect(b[0].words).toBe(0);
  });

  it('문항 4에만 서사차원이 붙는다', () => {
    const b = buildDialogueBlocks(turns, gsrWithBumps([]), flatHr());
    expect(b.find((x) => x.q === 1)!.서사차원).toBeUndefined();
    expect(b.find((x) => x.q === 4)!.서사차원).toBeDefined();
  });

  /** 부록 C: 최대 mismatch가 0.5 미만이면 hidden_finding을 억지로 만들지 않는다 */
  it('불일치가 전부 작으면 topMismatch가 null이다', () => {
    const b = buildDialogueBlocks(turns, gsrWithBumps([]), flatHr(), {
      valences: new Map([
        [1, 0.05],
        [4, 0.05],
      ]),
    });
    for (const x of b) {
      if (x.mismatch !== null) expect(x.mismatch).toBeLessThan(MISMATCH_THRESHOLD);
    }
    expect(topMismatch(b)).toBeNull();
  });
});
