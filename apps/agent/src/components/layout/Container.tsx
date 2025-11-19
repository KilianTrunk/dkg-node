import { View, ViewProps } from "react-native";
import usePlatform from "@/hooks/usePlatform";

export default function Container({ style, children, ...props }: ViewProps) {
  const { size } = usePlatform();

  // Responsive padding based on screen size
  const getResponsivePadding = () => {
    if (size.w.sm) return 16; // Mobile: compact padding
    if (size.w.md) return 24; // Tablet: medium padding
    return 32; // Desktop: generous padding for corporate feel
  };

  // Responsive max width
  const getMaxWidth = () => {
    if (size.w.sm) return "100%"; // Mobile: full width
    if (size.w.md) return 900; // Tablet: medium width
    if (size.w.lg) return 1200; // Large desktop
    return 1400; // Extra large desktop
  };

  return (
    <View
      style={[
        {
          flex: 1,
          width: "100%",
          maxWidth: getMaxWidth(),
          marginHorizontal: "auto",
          paddingHorizontal: getResponsivePadding(),
          paddingVertical: size.w.sm ? 16 : 24,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}
