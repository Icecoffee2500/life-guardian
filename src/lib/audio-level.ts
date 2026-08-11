'use client';

/**
 * 마이크 입력 레벨 측정.
 *
 * 왜 필요한가: 음성 인식은 **되는 척하기가 너무 쉽다.**
 * `webkitSpeechRecognition` 객체가 존재한다는 것과 실제로 소리가 들어온다는 것은
 * 전혀 다른 이야기인데, 이전 버전은 객체 존재만 보고 "편하게 말씀해 주세요"를 띄웠다.
 * 권한이 거부되거나 마이크가 음소거여도 화면은 태연히 듣는 척했다.
 *
 * 그래서 인식 결과와 별개로 **입력 레벨을 직접 잰다.** 막대가 움직이면 소리가
 * 들어오고 있는 것이고, 움직이지 않으면 참가자도 진행자도 즉시 안다.
 */

export interface MicHandle {
  /** 0~1. 현재 입력 레벨 */
  level(): number;
  /** 마이크가 실제로 열려 있는가 */
  live(): boolean;
  stop(): void;
}

/**
 * 마이크를 열고 레벨 측정을 시작한다. **사용자 제스처 안에서 호출한다.**
 * 실패하면 null — 호출부는 타이핑 입력으로 넘어가면 된다.
 */
export async function openMicrophone(): Promise<MicHandle | null> {
  if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        // 자동 이득 제어를 켜면 조용한 부스에서 잡음이 크게 증폭된다
        autoGainControl: false,
      },
    });
  } catch {
    return null;
  }

  let ctx: AudioContext;
  try {
    ctx = new AudioContext();
  } catch {
    for (const t of stream.getTracks()) t.stop();
    return null;
  }

  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  // 작을수록 반응이 빠르다. 말의 시작을 놓치지 않을 정도면 충분하다.
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.65;
  source.connect(analyser);

  const buf = new Float32Array(analyser.fftSize);
  let stopped = false;

  return {
    level() {
      if (stopped) return 0;
      analyser.getFloatTimeDomainData(buf);
      // RMS. 사람 목소리는 대체로 0.02~0.2 사이라 그 구간을 0~1로 편다.
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      return Math.max(0, Math.min(1, (rms - 0.004) / 0.14));
    },
    live() {
      return !stopped && stream.getAudioTracks().some((t) => t.readyState === 'live' && t.enabled);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      try {
        source.disconnect();
      } catch {
        /* 이미 해제됨 */
      }
      for (const t of stream.getTracks()) t.stop();
      void ctx.close().catch(() => {});
    },
  };
}
