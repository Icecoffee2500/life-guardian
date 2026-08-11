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
 * Grove GSR raw(0~1023) → 피부 전도도(µS).
 *
 * Seeed Grove GSR v1.2 데이터시트의 환산식을 전도도로 뒤집은 것:
 *   human_resistance = ((1024 + 2 * raw) * 10000) / (512 - raw)   [Ω]
 *   conductance(µS)  = 1e6 / resistance
 *
 * raw가 512에 가까워지면 저항이 발산하므로 분모를 막아 둔다.
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

export function rawToMicroSiemens(raw: number): number {
  const r0 = Math.min(1023, Math.max(0, raw));
  // 극성이 반대면 ADC 눈금을 뒤집어 읽는다
  const r = Math.min(511, GSR_POLARITY === 1 ? r0 : 1023 - r0);
  const resistance = ((1024 + 2 * r) * 10000) / Math.max(1, 512 - r);
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
  /** 접촉 불량 감시 — 값이 바닥에 붙어 있으면 전극이 떨어진 것이다 */
  private lowStreak = 0;

  constructor(private clock: SessionClock = sessionClock) {
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

    const us = rawToMicroSiemens(parsed.raw);
    // 전극이 떨어지면 raw가 한쪽 끝에 붙는다. 2초쯤 이어지면 품질을 내린다.
    if (parsed.raw < 12 || parsed.raw > 1010) this.lowStreak++;
    else this.lowStreak = 0;
    this._quality = this.lowStreak > 20 ? 'degraded' : 'ok';

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
