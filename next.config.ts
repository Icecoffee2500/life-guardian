import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // CLAUDE.md는 사람이 쓴 프로젝트 브리프다. next dev가 자동으로 덧붙이지 않게 한다.
  agentRules: false,
  // 개발 오버레이가 씬 좌하단 계기판을 가린다
  devIndicators: false,
};

export default nextConfig;
