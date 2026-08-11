import { BaseSource } from './base';
import { sessionClock, type SessionClock } from './clock';
import { clamp } from './random';
import type { GazeSample, SourceKind, SourceMode } from './types';

/**
 * WebGazer.js 웹캠 시선 추적.
 *
 * 정확도에 대한 기대치를 먼저 적어 둔다: **화면 좌우 판정에만 쓴다.**
 * WebGazer의 오차는 데스크톱 환경에서 시야각 4~5도 수준이라 응시점 좌표를
 * 그대로 믿을 수 없다. 하지만 이 프로젝트가 필요한 건 "왼쪽이냐 오른쪽이냐"뿐이고,
 * 그 정도는 보정 후 충분히 나온다.
 *
 * 라이브러리는 npm 패키지 대신 런타임에 스크립트로 불러온다.
 * WebGazer는 번들러와 사이가 나쁘고(전역 객체·워커 경로 가정), 무엇보다
 * **데모 모드에서는 절대 로드되면 안 된다**. 심사위원 대부분은 웹캠 권한을 주지 않는다.
 */

/** 자기호스팅한 webgazer 번들 경로. public/vendor/에 두고 커밋한다(CDN 의존 금지). */
export const WEBGAZER_SRC = '/vendor/webgazer.js';

interface WebGazerPrediction {
  x: number;
  y: number;
}

interface WebGazerApi {
  setRegression(name: string): WebGazerApi;
  setTracker(name: string): WebGazerApi;
  setGazeListener(cb: (data: WebGazerPrediction | null, t: number) => void): WebGazerApi;
  begin(): Promise<void>;
  end(): void;
  pause(): void;
  resume(): void;
  showVideoPreview(on: boolean): WebGazerApi;
  showPredictionPoints(on: boolean): WebGazerApi;
  showFaceOverlay(on: boolean): WebGazerApi;
  showFaceFeedbackBox(on: boolean): WebGazerApi;
  clearData?(): void;
  recordScreenPosition?(x: number, y: number, type: string): void;
}

declare global {
  interface Window {
    webgazer?: WebGazerApi;
  }
}

let loading: Promise<WebGazerApi> | null = null;

/** 스크립트를 한 번만 불러온다 */
export function loadWebGazer(src = WEBGAZER_SRC): Promise<WebGazerApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('브라우저가 아닙니다'));
  if (window.webgazer) return Promise.resolve(window.webgazer);
  if (loading) return loading;

  loading = new Promise<WebGazerApi>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => {
      if (window.webgazer) resolve(window.webgazer);
      else reject(new Error('webgazer 전역 객체를 찾지 못했습니다'));
    };
    el.onerror = () =>
      reject(new Error(`webgazer를 불러오지 못했습니다 (${src}). public/vendor에 두었는지 확인하세요`));
    document.head.appendChild(el);
  });
  return loading;
}

/** 9점 보정의 각 점 위치 (뷰포트 정규 좌표) */
export const CALIBRATION_POINTS: { x: number; y: number }[] = [
  { x: 0.1, y: 0.1 },
  { x: 0.5, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.1, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 0.9, y: 0.5 },
  { x: 0.1, y: 0.9 },
  { x: 0.5, y: 0.9 },
  { x: 0.9, y: 0.9 },
];

/** 보정 점 하나당 클릭 횟수 — WebGazer 권장값 */
export const CLICKS_PER_POINT = 5;

export class WebGazerSource extends BaseSource<GazeSample> {
  readonly kind: SourceKind = 'gaze';
  readonly mode: SourceMode = 'live';
  readonly label = '시선 (웹캠 · WebGazer)';

  private api: WebGazerApi | null = null;
  /** 예측이 끊긴 시간을 재서 품질에 반영한다 */
  private lastPredictionAt = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private smoothed: { x: number; y: number } | null = null;

  constructor(private clock: SessionClock = sessionClock) {
    super();
  }

  async connect(): Promise<void> {
    this.setStatus('connecting');
    try {
      const api = await loadWebGazer();
      this.api = api;

      api
        .setRegression('ridge')
        .setTracker('TFFacemesh')
        // 부스 화면에 웹캠 미리보기나 예측 점이 뜨면 체험이 통째로 망가진다.
        // 참가자는 자극을 봐야지 자기 얼굴을 보면 안 된다.
        .showVideoPreview(false)
        .showPredictionPoints(false)
        .showFaceOverlay(false)
        .showFaceFeedbackBox(false)
        .setGazeListener((data) => {
          if (!data) return;
          const w = window.innerWidth || 1;
          const h = window.innerHeight || 1;
          const x = clamp(data.x / w, 0, 1);
          const y = clamp(data.y / h, 0, 1);

          // WebGazer 예측은 프레임마다 크게 튄다. 지수 평활로 도약만 남긴다.
          if (this.smoothed === null) this.smoothed = { x, y };
          else {
            this.smoothed.x += (x - this.smoothed.x) * 0.35;
            this.smoothed.y += (y - this.smoothed.y) * 0.35;
          }

          this.lastPredictionAt = Date.now();
          this.push({
            t: this.clock.now(),
            x: this.smoothed.x,
            y: this.smoothed.y,
            // 좌우 판정에만 쓴다는 사실을 신뢰도에 반영한다.
            // 아이트래커가 아니므로 1.0을 주지 않는다.
            confidence: 0.6,
          });
        });

      await api.begin();

      // 얼굴이 프레임을 벗어나면 예측이 조용히 멈춘다. 그걸 품질로 드러낸다.
      this.lastPredictionAt = Date.now();
      this.watchdog = setInterval(() => {
        const stale = Date.now() - this.lastPredictionAt;
        this._quality = stale > 1500 ? 'degraded' : 'ok';
      }, 500);

      this.setStatus('streaming');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류';
      this.setStatus('error', `시선 추적 실패: ${msg}`);
      throw e;
    }
  }

  /**
   * 보정 점 하나를 학습시킨다.
   * 보정 UI가 참가자에게 점을 보여주고 클릭시킬 때마다 호출한다.
   */
  calibrateAt(clientX: number, clientY: number): void {
    this.api?.recordScreenPosition?.(clientX, clientY, 'click');
  }

  clearCalibration(): void {
    this.api?.clearData?.();
  }

  disconnect(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    try {
      this.api?.end();
    } catch {
      // 이미 종료됨
    }
    this.api = null;
    this.smoothed = null;
    super.disconnect();
  }
}
