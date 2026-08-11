# Life Guardian

삼성생명 **LIFENOLOGY LAB 3기** 공모전 출품작 — 인터랙티브 웹 데모.

생체신호로 '나도 몰랐던 나'를 읽어, 관계·직업 스트레스를 줄이는 개인 최적화 솔루션.
이 저장소는 그 비전을 10분짜리 체험으로 보여주는 웹앱이다. 제출물이자 부스 시연 도구다.

기획 원본은 [`상세기획안.md`](./상세기획안.md), 기술 계획은 [`구현계획.md`](./구현계획.md)에 있다.
작업 규칙은 [`CLAUDE.md`](./CLAUDE.md)를 따른다.

---

## 빠르게 실행

```bash
npm install
npm run dev
# http://localhost:3000
```

**환경변수 없이 전체 플로우가 완주된다.** 키가 없으면 규칙 기반 해석으로 영수증이 나오고,
Supabase가 없으면 localStorage에 저장된다. 심사위원은 URL만 열면 된다.

키를 넣으려면 `.env.example`을 `.env.local`로 복사해서 채운다.

| 변수 | 없을 때 |
|------|---------|
| `ANTHROPIC_API_KEY` | 규칙 기반 템플릿 해석 (`src/lib/interpret/fallback.ts`) |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | localStorage에만 저장 |

Supabase를 쓸 거면 [`supabase/schema.sql`](./supabase/schema.sql)을 SQL Editor에 붙여넣고 실행한다.

## 화면

| 경로 | 용도 |
|------|------|
| `/` | 랜딩 — 심사위원이 처음 보는 화면 |
| `/experience` | 체험 본편 (S0~S8) |
| `/operator` | 진행자 화면. 신호 모드·페르소나 전환, 해석 근거(evidence) |
| `/receipt/[sessionId]` | 80mm 감열지 영수증. QR로 다시 열린다 |

`/operator`는 **다른 창**에서 연다. 부스에서는 노트북이 진행자 화면을,
참가자 앞 모니터가 체험 화면을 띄운다.

두 화면은 실시간으로 이어져 있다:
- **같은 기기의 다른 창** — BroadcastChannel. 설정이 필요 없다
- **다른 기기** — Supabase Realtime broadcast. 환경변수가 있을 때만 켜진다

진행자 화면 헤더에 `실황 연결됨`이 뜨면 이어진 것이고, 그때 보이는 씬·심박·센서 상태는
체험 화면의 것이다. 진행 제어(일시정지·중단·씬 이동·모드/페르소나 변경)도 체험 화면에 전달된다.

> 실황은 테이블에 쓰지 않는다. 초당 두 번씩 DB에 넣으면 무료 티어가 하루를 못 버티고,
> 흘러가는 상태를 남길 이유도 없다. 남길 것(세션 기록)은 끝날 때 한 번만 저장된다.

## 체험 흐름

| 씬 | 내용 | 전체 / 압축 |
|----|------|------------|
| S0 | 인트로·고지·모드 선택 | — |
| S1 | 센서 연결 | — |
| S2 | 호흡 가이드 (베이스라인) | 60초 / 15초 |
| S3 | 이완 — 심박 하강을 눈으로 보여준다 | 30초 / 10초 |
| S4 | 시선 — 자극쌍 12개 (압축 6개) | 노출 6초 + 응시점 2초 |
| S5 | 그림 — 나무, 10년 뒤 나의 하루 | 90+30초 / 20+10초 |
| S6 | 대화 — 5문항 (압축 4문항) | 문항당 30초 / 18초 |
| S7 | 리플레이 — 해석 대기 시간을 세션 타임라인으로 덮는다 | 26초 / 12초 |
| S8 | bio-receipt | — |

진행자 단축키: 체험 화면에서 `→` 다음 씬, `←` 이전 씬.

## 신호 모드

`/operator`에서 바꾼다. **체험 중에는 바꾸지 않는다** (센서가 다시 연결된다).

| 모드 | 생체 | 시선 | 용도 |
|------|------|------|------|
| `demo` | 시뮬레이터 | 관람자의 포인터 | **기본값.** 심사위원이 URL만 열었을 때 |
| `auto` | 시뮬레이터 | 시뮬레이터 | 가상 참가자가 그림·대화까지 스스로 수행. 무인 시연 |
| `live` | 밴드 + Arduino GSR | 웹캠 (WebGazer) | 실기기 |

`live` 모드는 **자동으로 연결하지 않는다.** Web Bluetooth의 `requestDevice`와
Web Serial의 `requestPort`는 사용자 제스처 안에서만 호출할 수 있고 각각 선택 다이얼로그를
띄우기 때문에, 셋을 한꺼번에 부르면 두 번째부터 그냥 실패한다.

대신 처음에는 시뮬레이터가 붙어 체험이 살아 있고, 체험 화면 S1의 채널별
**기기 연결** 버튼으로 하나씩 교체한다. 연결에 실패하면 아무것도 바뀌지 않는다 —
시뮬레이터가 그대로 남아 체험이 끊기지 않는다. 무엇이 실기기이고 무엇이 시뮬레이터인지는
`/operator`의 센서 목록(`mode` 열)에서 볼 수 있다.

## 실기기 준비 (M5 — 기기 도착 후)

### 심박 밴드
표준 GATT Heart Rate Service(0x180D)를 지원하는 밴드면 된다.
Web Bluetooth는 **HTTPS 또는 localhost**에서만, 그리고 **사용자 제스처 안에서만** 동작한다.
Chrome 계열 브라우저를 쓴다.

### GSR (Arduino + Grove GSR)
1. [`arduino/gsr_stream.ino`](./arduino/gsr_stream.ino)를 업로드한다
2. **시리얼 모니터를 닫는다** — 포트를 점유하면 브라우저가 열지 못한다
3. `/operator`에서 신호 모드를 `실기기`로 바꾼다
4. 체험 화면 S1(신호를 연결합니다)에서 채널별 **기기 연결** 버튼을 누른다

> ⚠ **극성을 반드시 확인할 것.** Grove GSR은 오프셋 포텐셔미터 때문에 출력이
> 뒤집혀 물리는 경우가 있다. 그러면 모든 SCR이 상하 반전되어 각성 해석이 정확히 반대로 나온다.
> 전극을 끼고 30초 안정 → 갑자기 크게 숨을 들이쉰다 → 1~3초 뒤 GSR 값이 **올라가야** 한다.
> 내려가면 `src/lib/sensors/serial-gsr.ts`의 `GSR_POLARITY`를 `-1`로 바꾼다.

### 시선 (WebGazer, 선택)
```bash
curl -L -o public/vendor/webgazer.js \
  https://raw.githubusercontent.com/brownhci/WebGazer/master/dist/webgazer.js
```
파일이 없으면 포인터 프록시로 자동 폴백한다. WebGazer는 GPLv3이므로
공모전 제출 시 라이선스를 확인할 것.

## 부스 세팅 체크리스트

- [ ] 노트북 Chrome, 참가자 모니터에 `/experience`, 노트북에 `/operator`
- [ ] 압축 모드로 한 번 완주해 소요시간 실측
- [ ] GSR 전극 착용 후 **2~3분 수화 대기** 뒤에 베이스라인을 잡는다
- [ ] 감열 프린터는 80mm. `/receipt/[id]`에서 인쇄 미리보기로 폭 확인
- [ ] 조명을 일정하게 — 시선 세션 중 밝기가 바뀌면 동공·GSR이 함께 흔들린다
- [ ] 진행자 반응은 문항마다 **동일하게** ("네" 정도). 부록 B 가이드는 `/operator`에 떠 있다

## 아키텍처

```
src/
├─ app/                 라우트 (랜딩 · 체험 · 진행자 · 영수증 · API)
├─ components/
│  ├─ scenes/           S0~S8 씬
│  ├─ experience/       진행 레일 · 계기판 · 세션 타임라인
│  ├─ stimuli/          자극 플레이트
│  └─ receipt/          영수증 시트
├─ lib/
│  ├─ sensors/          DataSource 추상화 (시뮬레이터 · 포인터 · 실기기)
│  ├─ features/         FeatureEngine — 모든 점수 계산 (순수 함수)
│  ├─ interpret/        부록 C 프롬프트 · 스키마 · 규칙 기반 폴백
│  ├─ stimuli/          부록 A 자극쌍 + 생성 아트
│  ├─ dialogue/         부록 B 스크립트
│  ├─ session/          상태 머신 · 레코더 · 씬 정의
│  └─ storage/          localStorage + Supabase
└─ hooks/
```

지켜야 할 두 가지:

**1. LLM은 해석만 한다.** 시선 가중합, 그림 4축 환산, 불일치 지수 — 모든 수치 계산은
`src/lib/features/`에서 끝나고 결과 JSON만 LLM에 넘어간다. 원시 신호(수만 개 표본)는
브라우저 밖으로 나가지 않는다.

**2. 센서는 인터페이스 뒤에 숨는다.** 앱의 어떤 코드도 구체 센서에 직접 의존하지 않는다.
`DataSource<T>`를 만족하는 구현체를 갈아끼우면 끝이다.

## 검증

```bash
npm run test        # 유닛 테스트
npx tsc --noEmit    # 타입체크
npx eslint .        # 린트
npm run build       # 프로덕션 빌드

# 브라우저로 전체 플로우를 밟으며 스크린샷 (dev 서버가 떠 있어야 한다)
node scripts/shoot.mjs ./shots
node scripts/shoot-receipt.mjs ./shots   # 완주 → 영수증까지
node scripts/shoot-landing.mjs ./shots   # 랜딩 스크롤
```

`scripts/shoot.mjs`는 압축 모드로 S0→S8을 실제로 통과하면서 시선 씬에서는 포인터를 움직이고
그림 씬에서는 획을 긋는다. 콘솔 오류가 하나라도 있으면 종료 코드가 1이다.

## 자극 이미지

부록 A의 사진 12쌍은 **아직 확정되지 않았다.** 그동안은 모티프마다 결정적(seeded)인
선 구성을 생성해 자리를 지킨다 (`src/lib/stimuli/motif-art.ts`).

한 쌍의 두 판이 서로 다른 시각적 무게를 가지면 시선이 쏠린 이유가 그 사람의 성향이 아니라
그림의 밀도가 되어버린다. 그래서 잉크 총량을 정규화하고 그 불변식을 테스트로 고정했다
(`motif-art.test.ts`).

사진이 확정되면 `src/lib/stimuli/pairs.ts`의 `StimulusImage.src`만 채우면 된다.
출처는 각 쌍의 `source` 필드에 이미 적혀 있다 (Unsplash / Pexels / OASIS / VAPS / 직접 촬영).

## 윤리 가드레일

코드로 강제하는 것들 (부록 B·C):

- 진단명·단정형 표현 금지 — 시스템 프롬프트 규칙 + 폴백 문장 검사 테스트
- 음성 원본 미저장 — STT 텍스트만 남기고 오디오는 어디에도 쓰지 않는다
- 언제든 건너뛰기 — 대화 씬에 상시 노출
- 결측·저품질 축은 언급하지 않는다 — `quality: "missing"`으로 명시해 넘기고, 모델은 건너뛴다
- `mismatch`가 0.5 미만이면 `hidden_finding`을 `null`로 둔다 — 없는 불일치를 만들지 않는다
- evidence는 영수증에 인쇄하지 않고 `/operator`에만 띄운다

## 기술 스택

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Zustand · Motion ·
Canvas 2D · Zod · Anthropic SDK · Supabase · Vitest · Playwright

폰트는 Pretendard를 self-host한다 (`public/fonts/pretendard/`).
