# [디자인 브리핑 - 002호]

## 📝 주제: 3D 홀로그램 셰프 카드 디자인 검수 및 구현 가이드

전략기획실에서 제안한 **'3D 홀로그램 셰프 카드'** 기획안을 디자이너 관점에서 검수하고, 초보 개발자도 쉽게 구현할 수 있는 기술 및 디자인 가이드를 제시합니다.

---

## 1. 상표권 및 유사성 검토 (Visual safety)

*   **검토 결과:** **[안전 (조건부)]**
    *   **이유:** 플립 카드 모션과 금속 테두리는 대중적인 UI 패턴(스포츠 카드, 인증서 등)으로, 특정한 권리를 침해하지 않습니다.
    *   **⚠️ 주의 사항 (표절 시비 방지):**
        *   디아블로, 하스스톤 등 **게임형 카드 디자인의 양각 문양(Gothic/Medieval 프레임)**을 그대로 차용하면 '게임 모방' 느낌을 줍니다.
        *   우리 앱의 **글래스모피즘(Glassmorphism)과 플랫한 타이포그래피**를 결합하여 "모던 피트니스/푸드 테크" 느낌으로 차별화해야 합니다.

---

## 2. 뉴비 개발자를 위한 구현 가이드 (React Native Reanimated)

초보자도 렉(Lag) 없이 60fps로 구현할 수 있는 **2D 회전 트릭(rotateY)** 방식을 제안합니다. 실제 3D 모델(Three.js 등)을 쓰는 것보다 훨씬 가볍고 쉽습니다.

### 💡 핵심 메커니즘
1.  **구조:** `Animated.View` 2개를 겹쳐놓고(Front, Back), `backfaceVisibility: 'hidden'` 처리.
2.  **트릭:** 뒷면 카드는 시작할 때 이미 `rotateY: '180deg'`로 뒤집어 둡니다.
3.  **트리거:** 터치 시 `useSharedValue`를 0에서 1로 `withSpring()` 애니메이트합니다.

### 💻 가이드 코드 스니펫 (구현 참고용)
```tsx
import Animated, { useAnimatedStyle, useDerivedValue, interpolate, withSpring } from 'react-native-reanimated';

// 1. 회전 값 관리
const isFlipped = useSharedValue(false);
const rotateValue = useDerivedValue(() => withSpring(isFlipped.value ? 180 : 0));

// 2. 앞면 스타일
const frontStyle = useAnimatedStyle(() => ({
  transform: [{ perspective: 1000 }, { rotateY: `${rotateValue.value}deg` }],
  backfaceVisibility: 'hidden',
}));

// 3. 뒷면 스타일 (180도 가산)
const backStyle = useAnimatedStyle(() => ({
  transform: [{ perspective: 1000 }, { rotateY: `${rotateValue.value + 180}deg` }],
  position: 'absolute',
  backfaceVisibility: 'hidden',
}));
```
> **💡 뉴비 팁:** `perspective: 1000` 속성이 없으면 회전할 때 입체감(Depth) 없이 평면으로 보이므로 반드시 추가해야 합니다.

---

## 3. 에셋 확인 및 색상 코드 (Hex Code)

*   **에셋 검증:** 정적 이미지 다운로드 대신 **`expo-linear-gradient`를 통한 100% 코드 구현**을 강력히 권장합니다.
    *   **장점:** 저작권 리스크 0%, 앱 용량 감소, 동적 애니메이션(빛 반사) 가능.

### 🎨 레벨별 메탈릭 그라데이션 프리셋

| 레벨 | 컨셉 | 그라데이션 컬러 조합 추천 (Hex) | 설명 |
| :--- | :--- | :--- | :--- |
| **Bronze** | 요리 초급 | `#A97142`, `#895E1A`, `#CCA074` | 따뜻한 골동품 느낌의 구리 빛 |
| **Silver** | 견습 셰프 | `#A8A9AD`, `#E3E3E3`, `#FFFFFF`, `#8F9196` | 도회적이고 깨끗한 스테인리스 스틸 느낌 |
| **Gold** | 수석 셰프 | `#E8A200`, `#FFDF01`, `#D4AF37`, `#FFF4A3` | 대비를 극대화해 쨍하고 화려한 반사광 연출 |
| **Holo** | 마스터 | `#FCB69F`, `#FFECD2`, `#A1C4FD`, `#C2E9FB` | 오팔/레인보우 파스텔 그라데이션 (홀로그램) |

### ✨ 디자이너의 한 끗 (Hologram Effect)
홀로그램 효과는 그라데이션의 `start`와 `end` 좌표를 시간에 따라 살짝씩 움직여주기만 해도 **"빛을 받을 때 무지갯빛이 찰랑거리는 효과"**를 뉴비 개발자도 아주 쉽게 만들 수 있습니다.

---

**보고자:** Cook-Dex 수석 UI/UX 디자이너
