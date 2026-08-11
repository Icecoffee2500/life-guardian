import { BaseSource } from './base';
import { sessionClock, type SessionClock } from './clock';
import type { BioSample, SourceKind, SourceMode } from './types';

/**
 * Web Bluetooth 심박 밴드 — 표준 Heart Rate Service (0x180D).
 *
 * 기기가 아직 배송 전이라 실물로 검증하지 못했다. 그래서 이 파일은
 * **명세에 최대한 충실하게** 쓰고, 실패하면 조용히 죽지 않고 error 상태를 올린다.
 * 연결 실패 시 시뮬레이터로 갈아끼우는 일은 useSensors가 맡는다.
 *
 * 표준 참고: GATT Heart Rate Measurement (0x2A37)
 *   byte 0 : flags
 *     bit0 = 심박값이 uint16인가 (0이면 uint8)
 *     bit3 = 에너지 소비 필드 존재
 *     bit4 = RR 간격 필드 존재
 *   이후 심박값, (에너지 2byte), RR 간격들(uint16, 1/1024초 단위)
 *
 * 주의: Web Bluetooth는 사용자 제스처에서만 requestDevice를 호출할 수 있고
 * HTTPS(또는 localhost)에서만 동작한다. 부스 노트북은 Chrome을 쓴다는 전제다.
 */

const HEART_RATE_SERVICE = 0x180d;
const HEART_RATE_MEASUREMENT = 0x2a37;

/** RR 간격은 1/1024초 단위로 온다 */
const RR_UNIT_MS = 1000 / 1024;

export interface HeartRateReading {
  hr: number;
  rr: number[];
}

/**
 * Heart Rate Measurement 특성 값을 파싱한다.
 * 순수 함수이므로 기기 없이 테스트할 수 있다 — 실기기 검증 전까지는 이게 유일한 안전망이다.
 */
export function parseHeartRate(view: DataView): HeartRateReading {
  const flags = view.getUint8(0);
  const hr16 = (flags & 0x01) !== 0;
  const hasEnergy = (flags & 0x08) !== 0;
  const hasRr = (flags & 0x10) !== 0;

  let offset = 1;
  const hr = hr16 ? view.getUint16(offset, true) : view.getUint8(offset);
  offset += hr16 ? 2 : 1;
  if (hasEnergy) offset += 2;

  const rr: number[] = [];
  if (hasRr) {
    while (offset + 1 < view.byteLength) {
      rr.push(view.getUint16(offset, true) * RR_UNIT_MS);
      offset += 2;
    }
  }
  return { hr, rr };
}

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export class BleHeartRateSource extends BaseSource<BioSample> {
  readonly kind: SourceKind = 'band';
  readonly mode: SourceMode = 'live';
  readonly label = '심박 밴드 (Bluetooth)';

  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private onValue = (e: Event) => {
    const target = e.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (!value) return;
    try {
      const { hr, rr } = parseHeartRate(value);
      // 명백한 이상값은 버린다. 밴드는 착용 직후 0이나 255를 뱉기도 한다.
      if (hr < 25 || hr > 240) {
        this._quality = 'degraded';
        return;
      }
      this._quality = 'ok';
      this.push({ t: this.clock.now(), hr, rr: rr.length ? rr : undefined });
    } catch {
      this._quality = 'degraded';
    }
  };

  private onDisconnected = () => {
    this.setStatus('error', '밴드 연결이 끊어졌습니다');
  };

  constructor(private clock: SessionClock = sessionClock) {
    super();
  }

  async connect(): Promise<void> {
    if (!isWebBluetoothAvailable()) {
      this.setStatus('error', '이 브라우저는 Web Bluetooth를 지원하지 않습니다');
      throw new Error('web bluetooth unavailable');
    }
    this.setStatus('connecting');
    try {
      // 사용자 제스처 안에서 호출되어야 한다 (진행자가 '연결' 버튼을 누른 시점)
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [HEART_RATE_SERVICE] }],
        optionalServices: [HEART_RATE_SERVICE],
      });
      this.device = device;
      device.addEventListener('gattserverdisconnected', this.onDisconnected);

      const server = await device.gatt?.connect();
      if (!server) throw new Error('GATT 서버에 연결하지 못했습니다');
      const service = await server.getPrimaryService(HEART_RATE_SERVICE);
      const ch = await service.getCharacteristic(HEART_RATE_MEASUREMENT);
      this.characteristic = ch;
      ch.addEventListener('characteristicvaluechanged', this.onValue);
      await ch.startNotifications();
      this.setStatus('streaming');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류';
      this.setStatus('error', `밴드 연결 실패: ${msg}`);
      throw e;
    }
  }

  disconnect(): void {
    try {
      this.characteristic?.removeEventListener('characteristicvaluechanged', this.onValue);
      void this.characteristic?.stopNotifications().catch(() => {});
      this.device?.removeEventListener('gattserverdisconnected', this.onDisconnected);
      this.device?.gatt?.disconnect();
    } catch {
      // 이미 끊어진 경우
    }
    this.characteristic = null;
    this.device = null;
    super.disconnect();
  }
}
