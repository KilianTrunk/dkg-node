import { View, Text, StyleProp, ViewStyle } from "react-native";
import { Image, ImageProps } from "expo-image";

import useThemeColor from "@/hooks/useThemeColor";

export default function HeaderLogo(props: {
  image: ImageProps["source"];
  textColor?: string;
  textFont?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const defaultTextColor = useThemeColor("text");

  return (
    <View
      style={[
        {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
        },
        props.style,
      ]}
    >
      <Image
        source={props.image}
        style={{
          width: 64,
          height: 32,
          marginRight: 8,
          marginLeft: 16,
          display: "flex",
        }}
        contentFit="contain"
        testID="header-logo"
      />
    </View>
  );
}
