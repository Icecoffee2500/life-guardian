import { BaseSource } from './base';
import { sessionClock, type SessionClock } from './clock';
import type { BioSample, SourceKind, SourceMode } from './types';

/**
 * Web Serial GSR — Arduino + Grove GSR 센서.
 *
 * 아두이노가 115200 baud로 한 줄에 한 표본씩 보낸다:
 *   `<millis>,<raw0..1023>\n`
 * 스케치는 arduino/gsr_stream.ino 참고.
 *
 * 변환은 여기서 한다. 아두이노는 ADC 값만 보내고 해석하지 않는다 —
 * 보정 상수를 바꿀 때마다 펌웨어를 다시 굽고 싶지 않기 때문이다.
 */

const BAUD_RATE = 115200;

/**
 * 무착용 기준값 — 전극을 빼놓았을 때 읽히는 raw.
 *
 * Seeed 절차는 이 값이 512가 되도록 보드의 트림팟을 돌리라고 한다.
 * 우리는 반대로 했다. 돌리는 대신 **실측해서 상수로 박는다.**
 * 부스에서 드라이버로 나사를 만질 일이 없어지고, 값이 문서로 남는다.
 *
 * ── 2026-08 실측 (Grove GSR + Uno, A2) ────────────────────────
 *   전극 분리(책상 위) → 682.8   (범위 682~683, 표준편차 0.42)
 *   전극 착용·안정     → 486
 *
 * 이 상수가 왜 중요한가: 식의 분모는 (기준값 - raw)이고, 이건
 * "피부가 기준선을 얼마나 끌어내렸는가" = 전도도의 크기다.
 * 512로 두면 착용 시 197이어야 할 신호를 26으로 읽는다 — 실제의 1/7.
 * 그러면 전도도가 0.8µS 같은 값이 나오는데, 사람 피부는 1~20µS다.
 * 즉 기준값이 틀리면 신호가 조용히 뭉개진다. 오류로 보이지 않는 게 함정이다.
 *
 * 모듈을 바꾸면(우리는 5개를 샀다) 반드시 다시 재고, 개체별로 다르면
 * 생성자 인자로 넘긴다. 재는 법은 arduino/gsr_stream.ino 주석 참고.
 */
export const GSR_CALIBRATION = 683;

/**
 * Grove GSR raw(0~1023) → 피부 전도도(µS).
 *
 * Seeed Grove GSR v1.2 데이터시트의 환산식을 전도도로 뒤집은 것:
 *   human_resistance = ((1024 + 2 * raw) * 10000) / (기준값 - raw)   [Ω]
 *   conductance(µS)  = 1e6 / resistance
 *
 * raw가 기준값에 닿으면 저항이 발산하므로 분모를 막아 둔다.
 * 이 값은 절대 정확도가 아니라 **자기 대비 변화**를 보려는 것이다.
 *
 * ⚠ 극성(POLARITY)을 실기기로 반드시 확인할 것.
 *
 * 이 식대로면 raw가 클수록 저항이 크고 전도도는 **낮다**. 그런데 Grove GSR은
 * 오프셋 조절 포텐셔미터가 달려 있어, 조정 위치에 따라 출력이 뒤집혀 보이는 보고가 많다.
 * 극성이 반대로 물리면 모든 SCR이 위아래로 뒤집히고, 그러면 각성이 큰 순간이
 * 정확히 반대로 해석된다 — 해석 엔진 전체가 조용히 거짓말을 하게 된다.
 *
 * 확인 방법(기기 도착 후 1분):
 *   1. 전극을 끼고 30초 안정
 *   2. 갑자기 크게 숨을 들이쉬거나 손뼉을 친다
 *   3. 1~3초 뒤 이 함수의 출력이 **올라가야** 한다
 *   내려간다면 GSR_POLARITY를 -1로 바꾼다.
 */
export const GSR_POLARITY: 1 | -1 = 1;

/**
 * 접촉이 살아 있다고 볼 수 있는 raw 상한.
 *
 * raw가 기준값에 가까워질수록 전도도는 0으로 수렴한다 = 피부가 회로에
 * 물려 있지 않다는 뜻이다. 기준값에서 30 눈금 안쪽이면 접촉이 없다고 본다.
 * (실측에서 착용 486 / 분리 683이므로 신호 폭은 197. 30은 그 15% 수준이다)
 *
 * 원래 이 판정은 ADC 레일 기준(raw > 1010)이었다. 실측에서 전극을 분리했을 때
 * 값이 1023이 아니라 683에서 멈추는 걸 보고서야 그 규칙이 이 하드웨어에서
 * 한 번도 발화하지 않는다는 걸 알았다 — 전극이 빠진 채로도 계속 '정상'이었다.
 * 그래서 고정 숫자가 아니라 **기준값에 상대적인** 판정으로 바꿨다.
 */
export const GSR_RAW_CONTACT_MAX = GSR_CALIBRATION - 30;

export function rawToMicroSiemens(raw: number, calibration = GSR_CALIBRATION): number {
  const r0 = Math.min(1023, Math.max(0, raw));
  // 극성이 반대면 ADC 눈금을 뒤집어 읽는다
  const r1 = GSR_POLARITY === 1 ? r0 : 1023 - r0;
  // 기준값에 닿으면 분모가 0이 된다. 한 눈금 아래에서 막는다.
  const r = Math.min(calibration - 1, r1);
  const resistance = ((1024 + 2 * r) * 10000) / Math.max(1, calibration - r);
  const us = 1e6 / resistance;
  // 사람 피부에서 나올 수 있는 범위를 넘으면 접촉 불량이다
  return Math.min(60, Math.max(0.05, us));
}

/** 한 줄을 파싱한다. 형식이 어긋나면 null (기기 없이 테스트 가능) */
export function parseLine(line: string): { deviceMs: number; raw: number } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const parts = trimmed.split(',');
  if (parts.length < 2) return null;
  const deviceMs = Number(parts[0]);
  const raw = Number(parts[1]);
  if (!Number.isFinite(deviceMs) || !Number.isFinite(raw)) return null;
  if (raw < 0 || raw > 1023) return null;
  return { deviceMs, raw };
}

export function isWebSerialAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export class SerialGsrSource extends BaseSource<BioSample> {
  readonly kind: SourceKind = 'gsr';
  readonly mode: SourceMode = 'live';
  readonly label = 'GSR (Arduino · Serial)';

  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private stopped = false;
  /** 변환식 밖으로 나간 표본이 연속으로 몇 개인지 (약 0.8초= 20표본이면 경고) */
  private badStreak = 0;

  /**
   * @param calibration 이 모듈의 무착용 기준값. 개체마다 다를 수 있으므로
   *   부스에서 다른 GSR 모듈을 쓰면 재서 넘긴다 (기본값은 우리가 실측한 것).
   */
  constructor(
    private clock: SessionClock = sessionClock,
    private calibration: number = GSR_CALIBRATION,
  ) {
    super();
  }

  async connect(): Promise<void> {
    if (!isWebSerialAvailable()) {
      this.setStatus('error', '이 브라우저는 Web Serial을 지원하지 않습니다');
      throw new Error('web serial unavailable');
    }
    this.setStatus('connecting');
    try {
      // 사용자 제스처 안에서 호출되어야 한다
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: BAUD_RATE });
      this.port = port;
      this.stopped = false;
      this.setStatus('streaming');
      void this.readLoop();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류';
      this.setStatus('error', `GSR 연결 실패: ${msg}`);
      throw e;
    }
  }

  /** 줄 단위로 끊어 읽는다. 시리얼은 임의 크기 청크로 도착한다. */
  private async readLoop(): Promise<void> {
    const port = this.port;
    if (!port?.readable) return;
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      const reader = port.readable.getReader();
      this.reader = reader;
      while (!this.stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nl = buffer.indexOf('\n');
        while (nl !== -1) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          this.handleLine(line);
          nl = buffer.indexOf('\n');
        }
        // 줄바꿈 없이 계속 쌓이면 형식이 다른 것이다. 무한히 키우지 않는다.
        if (buffer.length > 4096) buffer = '';
      }
    } catch (e) {
      if (!this.stopped) {
        const msg = e instanceof Error ? e.message : '읽기 오류';
        this.setStatus('error', `GSR 스트림 중단: ${msg}`);
      }
    } finally {
      try {
        this.reader?.releaseLock();
      } catch {
        // 이미 해제됨
      }
      this.reader = null;
    }
  }

  private handleLine(line: string): void {
    const parsed = parseLine(line);
    if (!parsed) return;

    const us = rawToMicroSiemens(parsed.raw, this.calibration);

    /*
     * 접촉이 살아 있는지 매 표본 확인한다.
     *
     * raw가 기준값 근처면 피부가 회로에 물려 있지 않다는 뜻이다. 그 구간의
     * 전도도는 의미가 없는데, 조용히 통과시키면 해석 엔진이 '각성이 없었다'로
     * 읽어버린다. 신호가 없는 것과 반응이 없는 것은 다르다.
     */
    const contactMax = this.calibration - 30;
    const unusable = parsed.raw >= contactMax || parsed.raw < 12;
    if (unusable) this.badStreak++;
    else this.badStreak = 0;

    if (this.badStreak > 20) {
      this._quality = 'degraded';
      this._error =
        parsed.raw >= contactMax
          ? `GSR raw ${parsed.raw} — 전극 접촉을 확인하세요 (무착용 기준값 ${this.calibration})`
          : `GSR raw ${parsed.raw} — 배선을 확인하세요`;
    } else if (this.badStreak === 0 && this._quality === 'degraded') {
      this._quality = 'ok';
      this._error = undefined;
    }

    // 기기 시각이 아니라 세션 시각을 쓴다. 여러 소스를 한 축에 정렬해야 한다.
    this.push({ t: this.clock.now(), gsr: us });
  }

  disconnect(): void {
    this.stopped = true;
    void (async () => {
      try {
        await this.reader?.cancel();
      } catch {
        // 이미 닫힘
      }
      try {
        await this.port?.close();
      } catch {
        // 이미 닫힘
      }
      this.port = null;
    })();
    super.disconnect();
  }
}
