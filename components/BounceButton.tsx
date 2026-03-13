import React from 'react';
import { Pressable, ViewStyle, StyleProp } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

interface BounceButtonProps {
  onPress?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  scaleDownTo?: number; 
}

export default function BounceButton({ 
  onPress, children, style, disabled = false, scaleDownTo = 0.92 
}: BounceButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return { transform: [{ scale: scale.value }] };
  });

  return (
    <Animated.View style={[style, animatedStyle]}>
      <Pressable
        onPressIn={() => {
          if (!disabled) scale.value = withSpring(scaleDownTo, { damping: 15, stiffness: 300 });
        }}
        onPressOut={() => {
          if (!disabled) scale.value = withSpring(1, { damping: 15, stiffness: 300 });
        }}
        onPress={onPress}
        disabled={disabled}
        // Pressable 내부의 뷰가 스타일을 온전히 상속받도록 처리
        style={{ width: '100%', alignItems: 'center', justifyContent: 'center' }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

