import { describe, expect, it } from 'vitest';
import { parseHeartRate } from './ble-heart-rate';
import {
  GSR_CALIBRATION,
  GSR_RAW_CONTACT_MAX,
  parseLine,
  rawToMicroSiemens,
} from './serial-gsr';

/**
 * 실기기가 배송 전이라 이 테스트가 유일한 검증 수단이다.
 * 파싱을 순수 함수로 떼어 둔 이유가 여기에 있다.
 */

function hrPacket(bytes: number[]): DataView {
  return new DataView(new Uint8Array(bytes).buffer);
}

describe('BLE 심박 측정값 파싱 (GATT 0x2A37)', () => {
  it('uint8 심박, RR 없음', () => {
    // flags=0x00 → 8bit 심박, RR 없음
    const r = parseHeartRate(hrPacket([0x00, 72]));
    expect(r.hr).toBe(72);
    expect(r.rr).toEqual([]);
  });

  it('uint16 심박', () => {
    // flags=0x01 → 16bit 심박 (리틀엔디언)
    const r = parseHeartRate(hrPacket([0x01, 0x48, 0x00]));
    expect(r.hr).toBe(72);
  });

  it('RR 간격을 1/1024초에서 ms로 바꾼다', () => {
    // flags=0x10 → RR 있음. 1024 = 1000ms
    const r = parseHeartRate(hrPacket([0x10, 60, 0x00, 0x04]));
    expect(r.rr).toHaveLength(1);
    expect(r.rr[0]).toBeCloseTo(1000, 5);
  });

  it('RR이 여러 개 실려 와도 모두 읽는다', () => {
    // 1024(=1000ms), 819(≈799.8ms)
    const r = parseHeartRate(hrPacket([0x10, 60, 0x00, 0x04, 0x33, 0x03]));
    expect(r.rr).toHaveLength(2);
    expect(r.rr[1]).toBeCloseTo(799.8, 1);
  });

  it('에너지 소비 필드가 있으면 건너뛰고 RR을 읽는다', () => {
    // flags=0x18 → 에너지(2byte) + RR
    const r = parseHeartRate(hrPacket([0x18, 65, 0xff, 0x00, 0x00, 0x04]));
    expect(r.hr).toBe(65);
    expect(r.rr[0]).toBeCloseTo(1000, 5);
  });

  it('uint16 심박 + 에너지 + RR 조합', () => {
    const r = parseHeartRate(hrPacket([0x19, 0x50, 0x00, 0x11, 0x00, 0x00, 0x04]));
    expect(r.hr).toBe(80);
    expect(r.rr[0]).toBeCloseTo(1000, 5);
  });
});

describe('Grove GSR 변환', () => {
  /**
   * 데이터시트 식은 raw가 클수록 저항이 크고 전도도는 낮다.
   * 이 방향이 실기기와 반대라면 SCR이 통째로 뒤집혀 해석이 조용히 거짓말을 한다.
   * 기기 도착 시 GSR_POLARITY로 검증할 것 (serial-gsr.ts 주석 참고).
   */
  it('데이터시트대로 raw가 클수록 전도도가 낮다', () => {
    expect(rawToMicroSiemens(400)).toBeLessThan(rawToMicroSiemens(200));
    expect(rawToMicroSiemens(200)).toBeLessThan(rawToMicroSiemens(50));
  });

  it('단조롭다 — 같은 자극에 값이 오르내리지 않는다', () => {
    let prev = Infinity;
    for (let raw = 0; raw <= 511; raw += 1) {
      const v = rawToMicroSiemens(raw);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
  });

  it('사람 피부의 현실적인 범위 안에 머문다', () => {
    for (let raw = 0; raw <= 1023; raw += 7) {
      const v = rawToMicroSiemens(raw);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0.05);
      expect(v).toBeLessThanOrEqual(60);
    }
  });

  it('raw가 512에 가까워져도 발산하지 않는다', () => {
    expect(Number.isFinite(rawToMicroSiemens(511))).toBe(true);
    expect(Number.isFinite(rawToMicroSiemens(512))).toBe(true);
    expect(Number.isFinite(rawToMicroSiemens(1023))).toBe(true);
  });

  it('전형적인 안정 구간 raw는 그럴듯한 µS를 낸다', () => {
    // 실제 착용 시 대체로 300~450 사이에 앉는다
    const v = rawToMicroSiemens(380);
    expect(v).toBeGreaterThan(1);
    expect(v).toBeLessThan(30);
  });

  /**
   * 아래는 2026-08 실측(Grove GSR + Uno, A2)을 박아 둔 회귀 테스트다.
   *   전극 분리(책상 위) → 683
   *   전극 착용·안정     → 486
   * 전극을 뗐을 때 값이 1023이 아니라 683에서 멈추는 걸 보고서야, 레일 기준으로
   * 접촉 불량을 잡으려던 원래 규칙이 이 하드웨어에서 무용지물임을 알았다.
   */
  it('실측된 착용값이 사람 피부 범위(1~20µS) 안에 들어온다', () => {
    // 기준값을 512로 두면 여기서 0.8µS가 나왔다. 신호가 1/7로 뭉개진 채
    // 오류처럼 보이지도 않았다 — 이 테스트가 그 재발을 막는다.
    const worn = rawToMicroSiemens(486);
    expect(worn).toBeGreaterThan(1);
    expect(worn).toBeLessThan(20);
  });

  it('무착용 기준값에서는 전도도가 0에 수렴한다', () => {
    expect(rawToMicroSiemens(GSR_CALIBRATION)).toBeLessThan(0.1);
  });

  it('접촉 판정 상한은 기준값보다 낮다 — 고정 숫자가 아니라 기준값 상대', () => {
    expect(GSR_RAW_CONTACT_MAX).toBeLessThan(GSR_CALIBRATION);
    // 착용값은 접촉 있음으로 통과해야 한다
    expect(486).toBeLessThan(GSR_RAW_CONTACT_MAX);
    // 분리값은 접촉 없음으로 걸려야 한다
    expect(683).toBeGreaterThanOrEqual(GSR_RAW_CONTACT_MAX);
  });

  it('기준값이 다른 모듈은 인자로 넘겨 쓴다 (5개를 샀다)', () => {
    // 같은 raw라도 기준값이 다르면 전도도가 달라져야 한다
    const a = rawToMicroSiemens(486, 683);
    const b = rawToMicroSiemens(486, 600);
    expect(a).not.toBeCloseTo(b, 3);
    // 기준값이 raw에 가까울수록 분모가 작아지고, 저항이 커지고, 전도도는 낮아진다
    expect(b).toBeLessThan(a);
  });
});

describe('시리얼 줄 파싱', () => {
  it('millis,raw 형식을 읽는다', () => {
    expect(parseLine('12345,412')).toEqual({ deviceMs: 12345, raw: 412 });
  });

  it('주석과 빈 줄은 무시한다', () => {
    expect(parseLine('# life-guardian gsr stream')).toBeNull();
    expect(parseLine('')).toBeNull();
    expect(parseLine('   ')).toBeNull();
  });

  it('깨진 줄은 버린다 — 시리얼은 첫 줄이 잘려 오는 일이 흔하다', () => {
    expect(parseLine('345,41')).not.toBeNull(); // 잘렸지만 형식은 맞다
    expect(parseLine('12345')).toBeNull();
    expect(parseLine('abc,def')).toBeNull();
    expect(parseLine('12345,9999')).toBeNull(); // ADC 범위 밖
    expect(parseLine('12345,-5')).toBeNull();
  });

  it('CR이 붙어 있어도 읽는다 (윈도우 줄바꿈)', () => {
    expect(parseLine('12345,412\r')).toEqual({ deviceMs: 12345, raw: 412 });
  });
});
