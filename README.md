# CookDex (쿡덱스)

React Native(Expo) + Firebase 기반 요리/레시피 앱입니다.

## 프로젝트 소개

- **앱 이름**: CookDex (쿡덱스)
- **스택**: React Native, Expo (Expo Router), Firebase Auth + Firestore
- **주요 기능**
  - AI 레시피 생성 (Gemini 연동)
  - 스캔 레시피 (카메라 → AI 분석)
  - 레시피 검색 (내 주방·요리 광장, TTS 조리 모드)
  - 저장 레시피(스크랩), 퀘스트, 요리 광장(플라자), 혜택 상점, 설정(프로필·맞춤 설정)

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
  - **Gemini에 붙여넣기용**: `docs/GEMINI_정리본_프롬프트.md`
  - **백업·인수인계용**: `docs/백업용_프롬프트.md`

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
