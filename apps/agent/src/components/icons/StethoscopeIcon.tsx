import Svg, { SvgProps, Path, Circle } from "react-native-svg";

export default function StethoscopeIcon(props: SvgProps) {
  return (
    <Svg fill="none" {...props}>
      <Path d="M4.8 4.8c0-1.767 1.433-3.2 3.2-3.2s3.2 1.433 3.2 3.2v4.8c0 1.767-1.433 3.2-3.2 3.2S4.8 11.367 4.8 9.6V4.8z" />
      <Path d="M8 12.8v6.4c0 1.767 1.433 3.2 3.2 3.2s3.2-1.433 3.2-3.2v-1.6c0-.884.716-1.6 1.6-1.6s1.6.716 1.6 1.6v1.6c0 3.314-2.686 6-6 6S6.4 22.514 6.4 19.2v-6.4" />
      <Circle cx="8" cy="4.8" r="1.6" />
      <Path d="M16 16c2.209 0 4-1.791 4-4s-1.791-4-4-4" />
    </Svg>
  );
}
