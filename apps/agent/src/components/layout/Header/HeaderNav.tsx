import { router, Href } from "expo-router";
import { View, Text, StyleProp, ViewStyle, Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";

import type { PropsWithChildren, ReactNode } from "react";
import type { SvgProps } from "react-native-svg";

import useThemeColor from "@/hooks/useThemeColor";

function HeaderNavLink(props: {
  text: string;
  icon?: (props: SvgProps) => ReactNode;
  href?: Href;
  onPress?: () => void;
}) {
  const cardTextColor = useThemeColor("cardText");
  const primaryColor = useThemeColor("primary");

  // Hover animation state
  const hoverValue = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(hoverValue.value, [0, 1], [1, 1.05], Extrapolation.CLAMP),
      },
    ],
  }));

  const textAnimatedStyle = useAnimatedStyle(() => ({
    color: hoverValue.value > 0 ? primaryColor : cardTextColor,
  }));

  return (
    <Animated.View style={animatedStyle}>
    <Pressable
      onPress={() =>
        props.href ? router.navigate(props.href) : props.onPress?.()
      }
        onHoverIn={() => {
          hoverValue.value = withTiming(1, { duration: 200 });
        }}
        onHoverOut={() => {
          hoverValue.value = withTiming(0, { duration: 200 });
        }}
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        cursor: "pointer",
        userSelect: "none",
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 8,
      }}
    >
      {props.icon && (
        <props.icon height={18} width={18} stroke={cardTextColor} />
      )}
        <Animated.Text
          style={[
            textAnimatedStyle,
            {
          fontFamily: "Manrope_600SemiBold",
          fontWeight: "600",
          fontSize: 16,
          lineHeight: 24,
            },
          ]}
      >
        {props.text}
        </Animated.Text>
    </Pressable>
    </Animated.View>
  );
}

function HeaderNav(props: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return (
    <View
      style={[
        {
          display: "flex",
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: 24,
        },
        props.style,
      ]}
    >
      {props.children}
    </View>
  );
}

HeaderNav.Link = HeaderNavLink;

export default HeaderNav;
