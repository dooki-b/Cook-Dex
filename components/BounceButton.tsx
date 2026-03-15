import React from 'react';
import { Pressable, ViewStyle, StyleProp, PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface BounceButtonProps extends PressableProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleDownTo?: number; 
}

export default function BounceButton({ 
  children, style, disabled = false, scaleDownTo = 0.92, onPressIn, onPressOut, ...props 
}: BounceButtonProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...props}
      style={[style, animatedStyle]}
      onPressIn={(e) => {
        if (!disabled) scale.value = withSpring(scaleDownTo, { damping: 15, stiffness: 300 });
        if (onPressIn) onPressIn(e);
      }}
      onPressOut={(e) => {
        if (!disabled) scale.value = withSpring(1, { damping: 15, stiffness: 300 });
        if (onPressOut) onPressOut(e);
      }}
      disabled={disabled}
    >
      {children}
    </AnimatedPressable>
  );
}
