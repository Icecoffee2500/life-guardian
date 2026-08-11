import type { Persona } from '@/lib/sensors/personas';
import { clamp } from '@/lib/sensors/random';
import type { StimulusPair } from './pairs';

/**
 * 페르소나가 A와 B 중 어느 쪽에 끌리는가.
 *
 * -1(완전히 B) ~ +1(완전히 A). 시뮬레이션 시선의 입력이자,
 * 자동 모드에서 "이 사람이라면 이렇게 봤을 것"의 근거가 된다.
 *
 * 주의: 이 값은 시뮬레이터 전용이다. 특징 추출(M3)은 이 값을 절대 참조하지 않고
 * 실제로 기록된 시선 좌표만 본다. 그렇지 않으면 데모가 자기 답을 베끼는 꼴이 된다.
 */
export function preferenceForA(persona: Persona, pair: StimulusPair): number {
  if (pair.axis.kind === 'riasec') {
    const d = persona.riasec[pair.axis.a] - persona.riasec[pair.axis.b];
    return clamp(d / 1.6, -1, 1);
  }
  const v = persona.traits[pair.axis.trait] ?? 0;
  return clamp(pair.axis.positive === 'a' ? v : -v, -1, 1);
}

/**
 * 화면 오른쪽에 대한 선호로 환산한다.
 * 시뮬레이션 시선 소스는 affinity를 -1(좌) ~ +1(우)로 읽는다.
 */
export function affinityForRight(prefA: number, flipped: boolean): number {
  // flipped면 A가 오른쪽에 온다
  return flipped ? prefA : -prefA;
}
