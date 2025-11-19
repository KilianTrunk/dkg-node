import React from "react";
import Svg, {
  SvgProps,
  Path,
  Circle,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";

import useColors from "@/hooks/useColors";

export default function ChatMessageIconUser(props: SvgProps) {
  const colors = useColors();

  return (
    <Svg width={32} height={32} viewBox="0 0 32 32" {...props}>
      <Defs>
        {/* User icon gradient - slightly different shade */}
        <LinearGradient id="userGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#E57373" />
          <Stop offset="100%" stopColor="#FF9999" />
        </LinearGradient>
      </Defs>

      {/* User circle background */}
      <Circle
        cx={16}
        cy={16}
        r={14}
        fill="url(#userGradient)"
        stroke={colors.primary}
        strokeWidth={1.5}
      />

      {/* User/person icon */}
      <Path
        d="M12 20c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5M16 10.5c1.5 0 2.5 1.5 2.5 3s-1 3-2.5 3-2.5-1-2.5-3 1-3 2.5-3z"
        stroke="white"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
