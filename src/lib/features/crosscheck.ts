import type { RiasecType } from '@/lib/stimuli/pairs';
import type { CrossCheckBlock, DialogueTurnBlock } from './schema';

/**
 * 교차검증 — 시선이 가리키는 유형과 말이 가리키는 유형이 같은가.
 *
 * 부록 B 문항 2("요즘 시간 가는 줄 모르고 보게 되는 콘텐츠")는 선호 환경을 묻고,
 * 그 답이 시선 RIASEC 결과와 다르면 그것이 곧 불일치 후보다.
 *
 * 발화에서 유형을 뽑는 일은 원래 LLM의 몫이지만, 키가 없을 때도 이 축이
 * 살아 있어야 하므로 어휘 기반 근사를 함께 둔다. 근사임을 감추지 않는다.
 */

const RIASEC_LEXICON: Record<RiasecType, string[]> = {
  R: ['만들', '고치', '조립', '기계', '목공', '자동차', '운동', '캠핑', '요리', '수리', '도구'],
  I: ['다큐', '과학', '연구', '분석', '우주', '실험', '역사', '원리', '데이터', '탐구', '관찰'],
  A: ['그림', '음악', '디자인', '영화', '사진', '글', '공연', '전시', '작업', '예술', '창작'],
  S: ['사람', '상담', '가르치', '봉사', '돌보', '아이', '교육', '이야기 나누', '함께', '팀'],
  E: ['창업', '사업', '인터뷰', '설득', '리더', '기획', '투자', '협상', '마케팅', '경영', '방송'],
  C: ['정리', '일정', '기록', '정돈', '계획', '관리', '회계', '문서', '루틴', '체계', '세팅'],
};

const RIASEC_TYPES: RiasecType[] = ['R', 'I', 'A', 'S', 'E', 'C'];

/** 발화에서 RIASEC 상위 유형을 어휘 기반으로 추정한다 */
export function speechRiasec(transcript: string): RiasecType | null {
  const t = transcript.trim();
  if (!t) return null;
  let best: RiasecType | null = null;
  let bestN = 0;
  for (const type of RIASEC_TYPES) {
    const n = RIASEC_LEXICON[type].reduce((acc, w) => acc + (t.includes(w) ? 1 : 0), 0);
    if (n > bestN) {
      bestN = n;
      best = type;
    }
  }
  // 근거가 한 단어뿐이면 유형을 말하지 않는다
  return bestN >= 2 ? best : null;
}

export interface CrossCheckOptions {
  /** 가상 참가자 모드에서 미리 정해진 발화 유형 */
  speechTopOverride?: RiasecType | null;
}

export function buildCrossCheckBlock(
  gazeTop: RiasecType | null,
  dialogue: DialogueTurnBlock[],
  opts: CrossCheckOptions = {},
): CrossCheckBlock {
  // 선호 매체 문항(q=2)이 환경 축을 가장 직접적으로 드러낸다
  const q2 = dialogue.find((d) => d.q === 2);
  const speechTop =
    opts.speechTopOverride !== undefined
      ? opts.speechTopOverride
      : q2
        ? speechRiasec(q2.transcript)
        : null;

  return {
    gaze_vs_speech_riasec: {
      gaze_top: gazeTop,
      speech_top: speechTop,
      // 한쪽이라도 모르면 "일치한다/아니다"를 말할 수 없다
      agree: gazeTop !== null && speechTop !== null ? gazeTop === speechTop : null,
    },
  };
}
