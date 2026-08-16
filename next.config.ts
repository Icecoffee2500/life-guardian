import type { NextConfig } from 'next';

/**
 * 임베드 정책 — 공모전 제출물이라 **막지 않는다.**
 *
 * 지금까지는 헤더를 아무것도 안 붙여서 "기본값이라 우연히 열려 있는" 상태였다.
 * 그건 정책이 아니라 방치다. 누가 보안 헤더를 한 줄 추가하거나 플랫폼 기본값이
 * 바뀌면 그날로 임베드가 죽는데, 그때 원인을 찾기도 어렵다. 의도를 명시해 둔다.
 *
 * 두 가지를 같이 열어야 실제로 동작한다.
 *  1. frame-ancestors — 누가 이 페이지를 iframe에 넣을 수 있는가
 *  2. Permissions-Policy — 그 iframe 안에서 카메라·마이크를 쓸 수 있는가
 * 1만 열고 2를 두면 화면은 뜨는데 웹캠 시선 추적과 음성 인식이 조용히 죽는다.
 *
 * X-Frame-Options는 **일부러 넣지 않는다.** 이 헤더는 `ALLOWALL` 같은 값이 없고
 * 브라우저에 따라 frame-ancestors보다 먼저 적용돼서, 넣는 순간 오히려 막힌다.
 */
const EMBED_HEADERS = [
  {
    // 모든 도메인에서 iframe 임베드 허용
    key: 'Content-Security-Policy',
    value: 'frame-ancestors *',
  },
  {
    /*
      임베드된 상태에서도 카메라·마이크·오디오를 쓸 수 있게 한다.
      기본 허용 범위는 `self`뿐이라, 교차 출처 iframe 안에서는 부모가 allow를
      붙여도 이쪽에서 막혀 버린다.

      부모 쪽에도 아래가 필요하다 — 이건 우리가 어쩔 수 없는 부분이라 README에 적어 둔다:
        <iframe allow="camera; microphone; autoplay" …>
    */
    key: 'Permissions-Policy',
    value: 'camera=*, microphone=*, autoplay=*',
  },
];

const nextConfig: NextConfig = {
  // CLAUDE.md는 사람이 쓴 프로젝트 브리프다. next dev가 자동으로 덧붙이지 않게 한다.
  agentRules: false,
  // 개발 오버레이가 씬 좌하단 계기판을 가린다
  devIndicators: false,

  async headers() {
    return [{ source: '/:path*', headers: EMBED_HEADERS }];
  },
};

export default nextConfig;
