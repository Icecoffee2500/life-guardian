# public/vendor

여기에는 **런타임에 스크립트 태그로 불러오는 서드파티 번들**만 둔다.

## webgazer.js (시선 추적, 선택)

실기기 모드(`signalMode: 'live'`)에서만 쓴다. 데모·자동 모드에서는 절대 로드되지 않는다 —
심사위원 대부분은 웹캠 권한을 주지 않고, 권한 요청이 뜨는 순간 체험이 깨진다.

CDN을 쓰지 않는 이유: 부스 네트워크가 불안정하면 그대로 실패한다. 자기호스팅한다.

```bash
curl -L -o public/vendor/webgazer.js \
  https://raw.githubusercontent.com/brownhci/WebGazer/master/dist/webgazer.js
```

파일이 없어도 앱은 정상 동작한다. `WebGazerSource.connect()`가 실패하고
포인터 시선 프록시로 자동 폴백한다 (`src/hooks/useSensors.ts`).

라이선스: WebGazer.js는 GPLv3. 공모전 제출 시 이 점을 확인할 것.
