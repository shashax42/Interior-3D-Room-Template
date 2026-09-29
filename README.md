# 우리집 미리보기 (Interior 3D Room)

이사 가기 전에, **실제 그 방 모습 그대로의 3D 공간**에 가구를 놓아보고 걸어 다녀보는 웹 앱.

도면만 보고 상상하는 대신, 매물 사진 속 빈 방을 3D로 되살려서 벽지·바닥·창밖 빛까지 사진과 똑같은 방 안에서 꾸며본다.

## 흐름

1. **방 만들기**: 세 가지 방법 중 하나로 방 모양을 잡는다.
   - 치수(가로·세로)로 사각형 방
   - 도면 이미지를 올리고, 치수를 아는 벽 하나로 축척을 맞춘 뒤 따라 그리기
   - 모서리를 찍어 직접 그리기 (ㄱ자 방 등 자유 형태)

   문·창문을 벽에 끼우고, 천장 높이와 벽/바닥 색을 정한다.
   벽 장식(몰딩 패널, 천장 몰딩, 걸레받이, 천장 메달리온)은 문·창문을 피해서 자동으로 나눠 붙는다.
2. **사진 입히기**: 빈 방 사진을 올리고, 사진 속 방 모서리(바닥 또는 천장과 만나는 점)를 4개 이상 찍는다.
   앱이 사진을 찍은 카메라의 위치·방향·화각을 역산해서 사진을 3D 벽과 바닥에 그대로 입힌다.
   방 크기를 모르면 사진으로 가로·세로를 추정할 수도 있다(천장 높이 기준, 모서리 5개).
3. **꾸미기**: 가구를 실제 cm 치수로 배치한다. 드래그로 옮기고, 벽 가까이 가면 벽에 붙는다.
   캔들·인형·스탠드 같은 소품은 떨어뜨린 가구 위에 올라간다.
   색·크기 변경, 내 3D 파일(.glb) 업로드, 사진 시점에서 보기, 사진 톤 필터와 화면 저장을 지원한다.
   "프린세스 룸 / 모던 로맨틱 / 프렌치 살롱" 버튼으로 방 모양에 맞춰 한 번에 꾸밀 수 있다.
   "실물 스캔" 카테고리는 실제 가구를 3D 스캔한 모델(클래식 소파·암체어·콘솔·협탁, 샹들리에, 금장 액자,
   화병, 탁상시계)이라 사진처럼 보인다. 놓을 때 그 모델만 내려받는다.
4. **룸투어**: 방 안을 1인칭으로 걸어 다닌다. PC는 드래그 + WASD, 폰은 드래그 + 조이스틱.
5. **사진처럼 만들기 (AI)**: 지금 보는 3D 화면을 설계도 삼아, 같은 구도·배치의 "진짜 찍은 사진"을 만든다.
   - 무료: 버튼 한 번에 3D 이미지가 복사되고 ChatGPT가 열린다. 붙여넣고 요청문도 붙여넣으면 끝. 받은 사진은
     ⌘V로 앱에 붙여넣으면 "내 실사 사진" 갤러리에 모이고 3D와 밀어서 비교할 수 있다.
   - 자동(유료): `.env.local`에 `OPENAI_API_KEY`를 넣으면 앱 안에서 바로 만든다(`.env.example` 참고).
   실제 방 사진 시점에서 누르면 그 사진 속 방에 가구를 들인 사진으로 요청한다.
6. **실사 렌더 / VR 투어**: "✨ 실사 사진"은 지금 보는 장면을 패스 트레이싱으로 렌더한다. 창문으로 들어오는
   햇빛과 벽·바닥에 튕기는 빛까지 계산하고, AI 노이즈 제거(Open Image Denoise, WebGPU)로 마무리한다.
   "📷 여기서 360° 찍기"로 자리마다 360° 실사 사진을 찍으면, "🥽 VR 투어"에서 부동산 VR 투어처럼
   둘러보고 바닥의 동그라미를 눌러 다음 자리로 이동한다.

작업 내용은 브라우저(IndexedDB)에 자동 저장되고, ⌘Z / ⇧⌘Z로 되돌릴 수 있다.

## 실행

```bash
npm install
npm run dev
```

```bash
npm test          # 카메라 역산 테스트
npm run build     # 타입 검사 + 프로덕션 빌드
```

## 구조

| 경로 | 역할 |
| --- | --- |
| `src/types.ts` | 방, 문/창문, 사진, 가구 데이터 모델 (단위: m) |
| `src/store.ts` | zustand 상태, IndexedDB 저장, 되돌리기 |
| `src/geometry/plan.ts` | 평면 도형 계산 (벽 세그먼트, 안쪽 방향, 점-다각형 판정) |
| `src/geometry/cameraSolve.ts` | 사진 모서리 → 카메라 역산 (Levenberg–Marquardt, 여러 초기값) |
| `src/scene/projectionShader.ts` | 사진을 3D 표면에 투영하는 셰이더 (깊이맵으로 가려진 면 제외, 여러 장 블렌딩) |
| `src/scene/RoomMesh.tsx` | 벽(문·창 구멍), 바닥, 천장, 문짝·창틀 |
| `src/scene/TourControls.tsx` | 1인칭 이동, 벽·가구 충돌 |
| `src/plan/PlanEditor.tsx` | 2D 도면 편집기 (따라 그리기, 축척, 문/창 배치) |
| `src/photo/PhotoMatch.tsx` | 사진 위 모서리 찍기, 맞춤 결과 와이어프레임 |
| `src/furniture/` | 기본 가구와 프린세스 키트(`princess.tsx`: 캐노피 프릴 침대, 벌룬 커튼, 로코코 거울, 화장대, 루이 체어, 벽난로 등), GLB 업로드, 배치 규칙, 스타일 프리셋 |
| `server/aiPhoto.ts` | 개발 서버의 `/api/ai-photo`: API 키를 서버에만 두고 OpenAI 이미지 편집 API 호출 |
| `src/render/` | AI 사진(`aiPhoto.ts`, `AiPhotoOverlay.tsx`), 실사 렌더(`photoreal.ts`: 장면 변환 + three-gpu-pathtracer), AI 노이즈 제거(`denoise.ts`), 렌더 화면, VR 투어 뷰어 |
| `src/scene/Trim.tsx` | 몰딩 프로파일 압출, 문·창을 피한 패널 분할, 천장 메달리온 |

## 다음 단계

- **AI 360° VR 투어**: 360° 파노라마도 AI로 사진처럼 만들기 (각도마다 결과가 일관되게)
- **모서리 자동 인식**: 사진에서 벽 모서리를 AI로 찾아서 찍는 수고 없애기 (지금은 손으로 4개)
- **가구 가져오기**: CC0 3D 가구 라이브러리 연결, 상품 사진 → 3D 모델 변환(image-to-3D)
- **내보내기**: 꾸민 방을 glTF로 내보내서 Blender/3ds Max에서 고화질 렌더
- **정밀 룸투어**: 방을 영상으로 한 바퀴 찍어 3D로 복원(Gaussian Splatting)
- **도면 데이터 연동**: 아파트 도면 검색을 제휴 API로 연결하면 도면 → 방 자동 생성

## 서드파티 에셋

스캔 가구를 바꾸거나 늘리려면 `scripts/fetch-models.mjs`의 목록을 고치고 `node scripts/fetch-models.mjs`를 실행한다.
Poly Haven에서 받아 텍스처를 512px로 줄이고 meshopt로 압축해 `public/models/`와 `src/furniture/scanned.ts`를 만든다.

- `public/models/*.json`: [Poly Haven](https://polyhaven.com) 3D 스캔 모델 (CC0): ArmChair 01, Sofa 01, Classic Console 01, Classic Nightstand 01, Chandelier 01·03, Fancy Picture Frame 01·02, Antique Ceramic Vase 01, Mantel Clock 01
- `public/textures/*.jpg`: [Poly Haven](https://polyhaven.com) 재질 사진 (CC0): Laminate Floor 02, Beige Wall 001, Rough Linen, Velour Velvet, Marble 01
- `public/weights/rt_ldr.json`: [Open Image Denoise](https://github.com/RenderKit/oidn-weights) `rt_ldr.tza` 가중치를 base64로 담은 것 (Apache-2.0, `public/weights/LICENSE.txt`)
