/**
 * WebGazer 자산을 public/vendor로 복사한다.
 *
 * CDN을 쓰지 않는 이유: 부스 네트워크가 불안정하면 시선 추적이 통째로 죽는다.
 * git에 17MB를 커밋하지 않는 이유: node_modules에 이미 있는 것을 중복해서 들고 갈 이유가 없다.
 * 그래서 빌드 직전에 복사한다 (predev / prebuild).
 *
 * ⚠ WebGazer는 GPL-3.0-or-later다. 이 파일이 하는 일은 복사뿐이지만,
 *   배포물에 포함되는 순간 라이선스 검토가 필요하다. README 참고.
 */
import { cp, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const SRC = 'node_modules/webgazer/dist';
const DEST = 'public/vendor/webgazer';

const exists = async (p) => {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

if (!(await exists(SRC))) {
  // 의존성이 없어도 빌드는 성공해야 한다. 시선 추적만 비활성화된다.
  console.log('[vendor-webgazer] webgazer 미설치 — 건너뜁니다 (웹캠 시선 추적 비활성)');
  process.exit(0);
}

await mkdir(path.dirname(DEST), { recursive: true });

// 소스맵과 commonjs 빌드는 브라우저에서 쓰지 않는다. 그대로 복사하면 51MB가 된다.
await cp(SRC, DEST, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(SRC, src);
    if (!rel) return true;
    if (rel.endsWith('.map')) return false;
    if (rel.includes('commonjs')) return false;
    return true;
  },
});
console.log(`[vendor-webgazer] ${SRC} → ${DEST}`);
