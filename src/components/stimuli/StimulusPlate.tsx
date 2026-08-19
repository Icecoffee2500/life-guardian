'use client';

import { useState } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import { MOTIF_VIEWBOX, motifStrokes } from '@/lib/stimuli/motif-art';
import type { StimulusImage } from '@/lib/stimuli/pairs';

/**
 * 자극 한 장.
 *
 * **화면에 글자를 붙이지 않는다.**
 * "공구를 다루는 정비 작업장" 같은 설명이 사진 밑에 있으면 참가자는 그림이 아니라
 * 그 문장을 읽고 판단하게 된다. 그 순간 이 세션은 무의식적 선호가 아니라
 * 자기보고형 선택지 고르기가 된다 — 재려던 것과 정반대다.
 * 글자 자체가 시선을 강하게 끄는 데다, 두 라벨의 길이가 다르면 그것도 저수준 편향이다.
 *
 * 라벨은 alt 속성으로만 남긴다. 화면에는 안 보이고 스크린리더에는 읽힌다.
 * (리플레이·퀴즈·영수증에서 쓰는 label 자체는 그대로다. 노출 중에만 감춘다.)
 *
 * 두 장이 나란히 놓이므로 테두리·여백·크기가 완전히 같아야 한다.
 * 한쪽만 조금 크거나 밝으면 그게 곧 편향이 된다.
 *
 * 사진을 못 불러오면 모티프 아트로 되돌아간다. 부스에서 한쪽 판만 비어 있으면
 * 그 쌍은 못 쓰게 되는데, 그보다는 양쪽 다 일러스트로 보이는 편이 낫다.
 */
export default function StimulusPlate({
  image,
  active,
  className = '',
}: {
  image: StimulusImage;
  /** 노출 중인가 (응시점 구간에서는 false) */
  active: boolean;
  className?: string;
}) {
  // 사진 로딩이 실패하면 이 판만 모티프로 되돌린다
  const [broken, setBroken] = useState(false);
  const usePhoto = Boolean(image.src) && !broken;
  const strokes = usePhoto ? [] : motifStrokes(image.motif);

  return (
    <motion.figure
      className={`relative overflow-hidden rounded-[4px] border border-line bg-surface-sunken ${className}`}
      animate={{ opacity: active ? 1 : 0.14 }}
      transition={{ duration: 0.55, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {/* 사진이 판 전체를 채운다. 라벨이 있던 시절에는 그 높이만큼 사진이
          잘려 나가고 있었다 — 이제 4:3 원본이 잘리지 않고 그대로 들어간다. */}
      <div className="absolute inset-0">
        {usePhoto ? (
          <Image
            src={image.src as string}
            alt={image.label}
            fill
            className="object-cover"
            sizes="50vw"
            // 자극은 노출 6초 안에 떠 있어야 한다. 늦게 뜨면 그 시행은 버려야 한다.
            priority
            onError={() => setBroken(true)}
          />
        ) : (
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 ${MOTIF_VIEWBOX.w} ${MOTIF_VIEWBOX.h}`}
            preserveAspectRatio="xMidYMid slice"
            aria-hidden
          >
            {strokes.map((s, i) => (
              <path
                key={i}
                d={s.d}
                fill="none"
                /* 밝은 판 위에서는 잉크로 그린다. 예전의 흰 선은 배경에 그대로 묻혔다. */
                stroke="var(--color-ink)"
                /* 밝은 판 위의 잉크는 어두운 판 위의 흰 선보다 흐려 보인다.
                   두 판에 같은 배율을 적용하므로 좌우 편향은 생기지 않는다. */
                strokeOpacity={Math.min(1, s.alpha * 1.7)}
                strokeWidth={s.width}
                strokeLinecap="round"
              />
            ))}
          </svg>
        )}
      </div>
    </motion.figure>
  );
}
