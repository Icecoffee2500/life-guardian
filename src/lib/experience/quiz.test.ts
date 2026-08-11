import { describe, expect, it } from 'vitest';
import { SessionRecorder } from '@/lib/session/recorder';
import { STIMULUS_PAIRS } from '@/lib/stimuli/pairs';
import { buildQuiz, quizVerdict, scoreQuiz } from './quiz';

function recorderWithTree(firstStrokeAtSec: number): SessionRecorder {
  const rec = new SessionRecorder();
  rec.putDrawTask({
    id: 'tree',
    startedAt: 10_000,
    endedAt: 100_000,
    width: 800,
    height: 600,
    undos: 0,
    pressureSource: 'proxy',
    strokes: [{ points: [{ t: 10_000 + firstStrokeAtSec * 1000, x: 0.5, y: 0.5, p: 0.5 }] }],
  });
  return rec;
}

function addTurn(
  rec: SessionRecorder,
  q: number,
  topic: string,
  readEndT: number,
  latencySec: number,
) {
  rec.dialogueTurns.push({
    q,
    topic,
    readEndT,
    speechStartT: readEndT + latencySec * 1000,
    endT: readEndT + latencySec * 1000 + 3000,
    transcript: '응답',
    noResponse: false,
  });
}

describe('buildQuiz — 그림 착수 지연', () => {
  it('망설임 구간을 정답으로 고른다', () => {
    for (const [sec, expected] of [
      [0.4, 0],
      [2.0, 1],
      [7.5, 2],
    ] as const) {
      const items = buildQuiz(recorderWithTree(sec), { gazeTrusted: false });
      const item = items.find((i) => i.id === 'draw-latency');
      expect(item?.answer, `${sec}초`).toBe(expected);
    }
  });

  it('획이 하나도 없으면 문항을 만들지 않는다', () => {
    const rec = new SessionRecorder();
    rec.putDrawTask({
      id: 'tree',
      startedAt: 0,
      endedAt: 1000,
      width: 800,
      height: 600,
      undos: 0,
      pressureSource: 'proxy',
      strokes: [],
    });
    expect(buildQuiz(rec, { gazeTrusted: false })).toHaveLength(0);
  });
});

describe('buildQuiz — 대화 응답 지연', () => {
  it('가장 오래 뜸을 들인 문항을 정답으로 삼는다', () => {
    const rec = new SessionRecorder();
    addTurn(rec, 1, '일', 0, 0.5);
    addTurn(rec, 2, '관계', 20_000, 6.0);
    addTurn(rec, 3, '휴식', 40_000, 0.8);
    const item = buildQuiz(rec, { gazeTrusted: false }).find((i) => i.id === 'dialogue-latency');
    expect(item).toBeDefined();
    expect(item?.options[item.answer]).toBe('관계');
    expect(item?.reveal).toContain('6');
  });

  it('지연 차이가 미미하면 묻지 않는다 — 찍기가 되어버린다', () => {
    const rec = new SessionRecorder();
    addTurn(rec, 1, '일', 0, 1.0);
    addTurn(rec, 2, '관계', 20_000, 1.1);
    addTurn(rec, 3, '휴식', 40_000, 1.2);
    expect(buildQuiz(rec, { gazeTrusted: false })).toHaveLength(0);
  });

  it('문항 0(기준 발화)은 후보에서 뺀다', () => {
    const rec = new SessionRecorder();
    addTurn(rec, 0, '기준', 0, 30.0);
    addTurn(rec, 1, '일', 20_000, 0.5);
    addTurn(rec, 2, '관계', 40_000, 4.0);
    addTurn(rec, 3, '휴식', 60_000, 0.7);
    const item = buildQuiz(rec, { gazeTrusted: false }).find((i) => i.id === 'dialogue-latency');
    expect(item?.options).not.toContain('기준');
    expect(item?.options[item.answer]).toBe('관계');
  });

  it('무응답 문항은 세지 않는다', () => {
    const rec = new SessionRecorder();
    addTurn(rec, 1, '일', 0, 0.5);
    addTurn(rec, 2, '관계', 20_000, 4.0);
    rec.dialogueTurns.push({
      q: 3,
      topic: '휴식',
      readEndT: 40_000,
      speechStartT: null,
      endT: 45_000,
      transcript: '',
      noResponse: true,
    });
    // 유효 응답이 2개뿐이라 3지선다를 만들 수 없다
    expect(buildQuiz(rec, { gazeTrusted: false })).toHaveLength(0);
  });
});

describe('buildQuiz — 시선', () => {
  const pair = STIMULUS_PAIRS[0];

  function recorderWithGaze(aRatio: number, flipped = false): SessionRecorder {
    const rec = new SessionRecorder();
    const n = 100;
    const aCount = Math.round(n * aRatio);
    // A쪽은 flipped 여부에 따라 좌/우가 바뀐다
    const aX = flipped ? 0.85 : 0.15;
    const bX = flipped ? 0.15 : 0.85;
    rec.gazeTrials.push({
      pairId: pair.id,
      flipped,
      onset: 0,
      offset: 6000,
      samples: Array.from({ length: n }, (_, i) => ({
        t: 1000 + i * 50,
        x: i < aCount ? aX : bX,
        y: 0.5,
        c: 0.9,
      })),
    });
    return rec;
  }

  it('신뢰할 수 없는 시선(포인터)으로는 묻지 않는다', () => {
    expect(buildQuiz(recorderWithGaze(0.9), { gazeTrusted: false })).toHaveLength(0);
  });

  it('오래 본 쪽이 정답이다', () => {
    const item = buildQuiz(recorderWithGaze(0.9), { gazeTrusted: true })[0];
    expect(item.options[item.answer]).toBe(pair.a.label);
    expect(item.reveal).toContain(pair.a.label);
  });

  it('좌우가 뒤집혀도 A/B 판정은 같다', () => {
    const item = buildQuiz(recorderWithGaze(0.9, true), { gazeTrusted: true })[0];
    expect(item.options[item.answer]).toBe(pair.a.label);
  });

  it('반반이면 어느 쪽을 봤다고 말하지 않는다', () => {
    expect(buildQuiz(recorderWithGaze(0.52), { gazeTrusted: true })).toHaveLength(0);
  });
});

describe('채점', () => {
  const items = buildQuiz(recorderWithTree(0.4), { gazeTrusted: false });

  it('무응답은 오답으로 센다', () => {
    expect(scoreQuiz(items, [null])).toBe(0);
    expect(scoreQuiz(items, [items[0].answer])).toBe(1);
  });

  it('한 줄평은 단정하지 않는다', () => {
    for (const n of [0, 1, 2, 3]) {
      const v = quizVerdict(n, 3);
      expect(v).not.toMatch(/장애|질환|우울|불안장애/);
    }
    expect(quizVerdict(0, 0)).toBe('');
  });
});
