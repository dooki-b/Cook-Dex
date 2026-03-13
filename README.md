# CookDex (쿡덱스)

React Native(Expo) + Firebase 기반 요리/레시피 앱입니다.

## 프로젝트 소개

- **앱 이름**: CookDex (쿡덱스)
- **스택**: React Native, Expo (Expo Router), Firebase Auth + Firestore
- **주요 기능**
  - AI 레시피 생성 (Gemini 연동)
  - 스캔 레시피 (카메라 → AI 분석)
  - 레시피 검색 (내 주방·요리 광장, 홈/광장 검색 통일, 최근 검색·안심 필터, TTS 조리 모드)
  - 저장 레시피(스크랩), 퀘스트, 요리 광장(플라자·명예의 전당/랭킹/분류·급상승 레시피), 혜택 상점, 설정(프로필·맞춤 설정)
  - 통합 레시피 상세(재료/양념 구분, TTS, 신고, **요리 후기**·별점·후기 남기기·후기 신고)

## 다른 환경에서 작업하기

다른 PC나 팀원이 이 저장소를 clone 한 뒤 동일하게 실행·개발하려면 아래 순서를 따르면 됩니다.

### 1. 저장소 클론 및 의존성 설치

```bash
git clone <저장소 URL>
cd cook-dex
npm install
```

### 2. 환경 변수 설정 (.env)

API 키 등 비공개 값은 **Git에 올리지 않고** 로컬 `.env` 파일로 관리합니다.

- 프로젝트 루트에 `.env` 파일을 만들고 아래처럼 필요한 변수를 넣습니다.

  ```env
  EXPO_PUBLIC_GEMINI_API_KEY=여기에_Gemini_API_키_입력
  ```

- `.env`는 `.gitignore`에 포함되어 있어 원격 저장소에는 올라가지 않습니다.  
  **다른 환경에서 작업할 때는 해당 환경에서 직접 `.env`를 만들고 값을 채워야 합니다.**  
  (팀원에게는 키 값을 별도로 전달하거나, 각자 발급받아 사용)

### 3. 앱 실행

```bash
npx expo start
```

- 터미널에서 안내하는 대로 **Android/iOS 시뮬레이터** 또는 **Expo Go**로 실행하면 됩니다.
- 캐시 문제가 있으면 `npx expo start -c` 로 캐시 클리어 후 실행하세요.

### 4. 작업 맥락 복원 (선택)

- **지금까지 적용된 작업**을 이어받아 수정·기능 추가하려면 아래 문서를 참고하면 됩니다.
  - **Gemini에 붙여넣기용(요약형)**: `docs/GEMINI_정리본_프롬프트.md`
  - **백업·인수인계용(자세한 버전)**: `docs/백업용_프롬프트.md`

이 두 파일에는 다음과 같은 내용이 정리되어 있습니다.

- **디자인 시스템**  
  - `constants/design-tokens.ts` 기준의 2026 미니멀 라이트 & 오렌지 포인트 톤(Colors / Radius / Shadows).
- **주요 화면 구조 & 라우팅**  
  - 루트 스택: `login`, `(tabs)`, `scanner`, `tutorial`, `benefits`, `search`, `recipe-detail`, `plaza-hof`, `plaza-ranking`, `categories`.
  - 탭: `plaza`(요리 광장), `index`(홈), `benefits`(혜택 상점), `profile`(설정).  
    숨김 탭: `recipes`(내 주방), `quest`, `ranking`, `menu`, `create` 등.
  - 통합 레시피 상세: `app/recipe-detail.tsx`  
    - `source='plaza' | 'saved'` + `id`로 Firestore(`global_recipes`) 또는 AsyncStorage(`cookdex_saved_recipes`)에서 로드.  
    - 재료/양념 구분(만개의레시피 스타일), `🔊 조리 과정을 소리로 듣기` TTS, **기본 계량 가이드** 버튼, ⋮ 레시피 신고(`reports`).  
    - **요리 후기** 섹션(광장 레시피만): 평균 별점·후기 수, 포토 후기 가로 스크롤, 후기 리스트, "요리 후기 남기기"(별점+내용·부적절 필터), 후기별 신고(`review_reports`). Firestore `global_recipes/{id}/reviews` 서브컬렉션 및 문서 `ratingAvg`/`reviewCount` 갱신.
    - **릴레이 챌린지 & 다른 셰프들**: `relayFromId/relayRootId/relayDepth` 메타데이터 기반으로, 같은 레시피를 만든 다른 셰프 카드와 현재 레시피에서 파생된 릴레이 요리 카드들을 하단 섹션에 노출.
    - `plaza.tsx`·`recipes.tsx`에서 이 페이지로 `router.push` 통합.
  - Search: 홈/광장 검색 통일, 최근 검색·최근 본 셰프·안심 필터(탭 제거·ON/OFF 동일 박스), TTS 조리 모드.
  - Plaza: 상단 검색바 + 아이콘 그리드(명예의 전당→plaza-hof, 랭킹→plaza-ranking, 레시피 분류→categories), 실시간 급상승 5개, 카드 썸네일·별점·후기 수·인분/시간/난이도. 내부 검색/해시태그/탐색 탭 제거.
- **기능별 구현 정리**  
  - 홈(index): 테마 모달, 3D 큐레이션 카드, 레벨/칭호 뱃지, 상단 검색 버튼(`/search`) 등.
  - create-recipe: Gemini 연동, 3D Cover Flow, DEV 목업, **맞춤 요리 카드 탭 시 인분 선택**(카드 뒤집기·opacity 크로스페이드, pointerEvents·hitSlop 터치 개선 — 3D rotateY 플립은 플랫폼 이슈로 미도입), 완성 레시피에서 **기본 계량 가이드** 버튼 노출, **구조화된 스타일 입력 모달**, 광장 공유 전 `"셰프의 킥!"` 사진·텍스트 입력 모달, 광장용 ID 분리·**릴레이 메타데이터**(relayFromId/relayRootId/relayDepth) 저장 등.
  - recipe-detail: **릴레이 필드 로드** 및 "해당 요리를 만든 다른 셰프들!"·"릴레이 요리!" 섹션, 릴레이 제작 시 params로 create-recipe 이동.
  - Plaza / Recipes / Quest / Benefits / Scanner: 각 화면 UI 리팩터링(라이트 테마, 카드·버튼 스타일, AR 가이드, 중앙 크롭 등) + **Scanner용 Gemini DEV 목업** 및 create-recipe와 동일한 스타일 입력 모달 재사용.

> **TIP**: 새 작업자는 먼저 `docs/백업용_프롬프트.md` 전체를 읽어 구조를 이해하고,  
> 이후 실제 Gemini 작업 시 `docs/GEMINI_정리본_프롬프트.md`를 그대로 복사해 붙여넣으면 됩니다.

---

## Get started (기본 실행)

1. 의존성 설치  
   ```bash
   npm install
   ```

2. 앱 실행  
   ```bash
   npx expo start
   ```

라우팅은 **app** 디렉터리 기준 [file-based routing](https://docs.expo.dev/router/introduction)을 사용합니다.

## Learn more

- [Expo 문서](https://docs.expo.dev/)
- [Expo Router 소개](https://docs.expo.dev/router/introduction/)
