import { View, ViewProps } from "react-native";

import useThemeColor from "@/hooks/useThemeColor";
import usePlatform from "@/hooks/usePlatform";

export default function LayoutPill({ children, style, ...props }: ViewProps) {
  const cardColor = useThemeColor("card");
  const { width, size } = usePlatform();

  // Header-specific responsive height
  const getResponsiveHeight = () => {
    if (size.w.sm) return 60; // Mobile - more compact
    if (size.w.md) return 68; // Tablet
    return 76; // Desktop
  };

  return (
    <View
      style={{
        width: "100%",
        display: "flex",
        marginBottom: size.w.sm ? 12 : 20,
      }}
    >
      <View
        style={[
          {
            height: getResponsiveHeight(),
            width: "100%",
            maxWidth: size.w.lg ? 1400 : "100%",
            marginHorizontal: "auto",
            backgroundColor: "transparent", // Remove background for cleaner look
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: size.w.sm ? 20 : 40,
            // Subtle bottom border instead of rounded corners
            borderBottomWidth: 1,
            borderBottomColor: "rgba(255, 153, 153, 0.2)", // Very subtle pink line
          },
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
}
