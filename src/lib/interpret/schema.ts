import { z } from 'zod';

/**
 * 부록 C Output 스키마 — 영수증 필드에 그대로 꽂히도록 고정한다.
 *
 * persona_name 8자 이내, one_liner 25자 이내(영수증 헤드라인 제약).
 * 문장은 40자를 넘기지 않는다(영수증 출력 폭).
 */

export const RecommendationItem = z.object({
  name: z.string().min(1).max(24),
  why: z.string().min(1).max(60),
});

export const HiddenFinding = z.object({
  observation: z.string().min(1).max(60),
  reading: z.string().min(1).max(60),
  confidence: z.enum(['낮음', '보통', '높음']),
});

export const EvidenceItem = z.object({
  claim: z.string().min(1),
  source: z.string().min(1),
});

export const BioReceiptSchema = z.object({
  persona_name: z.string().min(1).max(12),
  one_liner: z.string().min(1).max(32),
  unconscious_summary: z.array(z.string().min(1).max(48)).min(2).max(4),
  hidden_finding: HiddenFinding.nullable(),
  recommendations: z.object({
    직업: z.array(RecommendationItem).min(1).max(2),
    커뮤니티: z.array(RecommendationItem).min(1).max(2),
    활동: z.array(RecommendationItem).min(1).max(2),
    취미: z.array(RecommendationItem).min(1).max(2),
  }),
  tuning_quest: z.string().min(1).max(60),
  evidence: z.array(EvidenceItem).min(1),
  disclaimer: z.string().min(1).max(60),
});

export type BioReceipt = z.infer<typeof BioReceiptSchema>;
export type RecommendationKey = keyof BioReceipt['recommendations'];

export const RECOMMENDATION_KEYS: RecommendationKey[] = ['직업', '커뮤니티', '활동', '취미'];

/** 발화 정서가 선평정 응답 (별도 호출) */
export const ValenceResponseSchema = z.object({
  ratings: z.array(
    z.object({
      q: z.number(),
      content_valence: z.number().min(-1).max(1),
    }),
  ),
});

export type ValenceResponse = z.infer<typeof ValenceResponseSchema>;
