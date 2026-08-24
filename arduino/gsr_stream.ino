/*
 * Life Guardian — Grove GSR 스트리머
 *
 * 하는 일은 하나뿐이다: ADC를 읽어 한 줄씩 내보낸다.
 *   <millis>,<raw 0..1023>\n
 *
 * 해석·보정·필터링은 전부 브라우저(src/lib/sensors/serial-gsr.ts)에서 한다.
 * 보정 상수를 바꿀 때마다 펌웨어를 다시 굽고 싶지 않기 때문이다.
 *
 * ── 배선 ─────────────────────────────────────────────
 *   Grove GSR  →  Arduino
 *     SIG      →  A2      ← GSR_PIN과 반드시 일치시킬 것
 *     GND      →  GND
 *     VCC      →  5V
 *   (Grove Base Shield를 쓰면 A2 포트에 그대로 꽂으면 된다)
 *
 *   포트를 옮겼다면 아래 GSR_PIN도 같이 바꾼다. 핀이 어긋나면 읽는 쪽이
 *   비어 있는 핀(floating)이 되는데, 이때도 값은 그럴듯하게 나온다 —
 *   중간값 근처에서 ±2 정도로 잔잔히 흔들린다. 신호가 죽은 줄 모르고
 *   넘어가기 딱 좋으므로, 배선을 바꾼 뒤에는 전극을 뺐다 꼈다 하며
 *   값이 실제로 움직이는지 반드시 확인한다.
 *
 * ── 보드 ─────────────────────────────────────────────
 *   Arduino UNO / Nano / Leonardo 아무거나.
 *   Web Serial은 보드를 가리지 않는다.
 *
 * ── 사용 ─────────────────────────────────────────────
 *   1. 이 스케치를 업로드한다
 *   2. **시리얼 모니터를 닫는다** (포트를 점유하면 브라우저가 열지 못한다)
 *   3. /operator 에서 신호 모드를 '실기기'로 바꾸고 포트를 선택한다
 *
 * ── 착용 ─────────────────────────────────────────────
 *   전극은 같은 손의 검지·중지 첫 마디에. 꽉 조이면 혈류가 막혀 값이 흐른다.
 *   착용 후 2~3분은 값이 계속 오른다(전극-피부 수화). 베이스라인은 그 뒤에 잡는다.
 *
 * ── 무착용 기준값 재기 (모듈을 바꾸면 반드시) ──────────
 *   Seeed 공식 절차는 보드의 트림팟을 돌려 무착용 시 512가 되게 맞추라고 한다.
 *   우리는 나사를 돌리는 대신 **실측해서 코드 상수로 박는다.** 부스에서
 *   드라이버를 들 일이 없고, 값이 문서로 남는다.
 *
 *   1. 전극을 손에서 빼서 책상에 내려놓는다 (개방 회로)
 *   2. 터미널에서 20초쯤 값을 본다:
 *        (stty 115200 raw -echo; cat) < /dev/cu.usbserial-XXX | awk -F, '{print $2}'
 *   3. 값이 안정되면 그 수를 src/lib/sensors/serial-gsr.ts 의
 *      GSR_CALIBRATION 에 넣는다 (개체별로 다르면 생성자 인자로 넘긴다)
 *
 *   이 값이 틀리면 신호가 조용히 뭉개진다. 오류로 보이지 않는 게 함정이다.
 *   2026-08 실측: 분리 683 / 착용 486 → 512로 뒀을 때 신호가 1/7로 줄었다.
 */

const int GSR_PIN = A2;

// 25Hz — 브라우저 쪽 시뮬레이터 틱과 같은 주기.
// GSR은 원래 느린 신호라 이보다 빠르게 볼 이유가 없고,
// 더 느리면 SCR의 상승 구간(1~3초)이 뭉개진다.
const unsigned long SAMPLE_INTERVAL_MS = 40;

// 짧은 이동평균. ADC 노이즈만 걷어내고 신호 모양은 건드리지 않는다.
// 창을 더 키우면 SCR의 시작 시점이 뒤로 밀린다.
const int SMOOTH_N = 4;

int buf[SMOOTH_N];
int bufIndex = 0;
bool bufFilled = false;
unsigned long lastSample = 0;

void setup() {
  Serial.begin(115200);
  // 보드가 준비될 때까지 잠깐 기다린다 (Leonardo 계열에서 첫 줄이 잘리는 것 방지)
  delay(200);
  for (int i = 0; i < SMOOTH_N; i++) buf[i] = analogRead(GSR_PIN);
  bufFilled = true;
  // 주석 줄은 파서가 무시한다 (serial-gsr.ts의 '#' 규칙)
  Serial.println("# life-guardian gsr stream 25hz millis,raw");
}

void loop() {
  unsigned long now = millis();
  if (now - lastSample < SAMPLE_INTERVAL_MS) return;
  lastSample = now;

  buf[bufIndex] = analogRead(GSR_PIN);
  bufIndex = (bufIndex + 1) % SMOOTH_N;

  long sum = 0;
  for (int i = 0; i < SMOOTH_N; i++) sum += buf[i];
  int smoothed = (int)(sum / SMOOTH_N);

  Serial.print(now);
  Serial.print(',');
  Serial.println(smoothed);
}
