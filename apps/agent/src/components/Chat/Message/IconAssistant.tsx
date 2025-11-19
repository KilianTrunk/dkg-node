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

export type AssistantState = 'idle' | 'thinking' | 'speaking' | 'processing';

interface MedsyAssistantIconProps extends SvgProps {
  state?: AssistantState;
}

export default function ChatMessageIconAssistant({
  state = 'idle',
  ...props
}: MedsyAssistantIconProps) {
  const colors = useColors();

  return (
    <Svg width={32} height={32} viewBox="0 0 32 32" {...props}>
      <Defs>
        {/* Medsy gradient for the main circle */}
        <LinearGradient id="medsyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#FF9999" />
          <Stop offset="100%" stopColor="#E57373" />
        </LinearGradient>
      </Defs>

      {/* Medical Cross Symbol */}
      <Circle
        cx={16}
        cy={16}
        r={14}
        fill="url(#medsyGradient)"
        stroke={colors.primary}
        strokeWidth={1.5}
      />

      {/* Medical Cross */}
      <Path
        d="M12 16h8M16 12v8"
        stroke="white"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* State indicator dot - only show during active processing */}
      {(state === 'speaking' || state === 'processing') && (
        <Circle
          cx={22}
          cy={8}
          r={3}
          fill={
            state === 'speaking' ? '#10B981' : // Green for speaking
            state === 'processing' ? '#FF9999' : 'transparent' // Pink for processing (matches theme)
          }
          opacity={0.9}
        />
      )}

      <Defs>
      </Defs>
    </Svg>
  );
}