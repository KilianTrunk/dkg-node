import Svg, { SvgProps, Path } from "react-native-svg";

export default function PulseIcon(props: SvgProps) {
  return (
    <Svg fill="none" {...props}>
      <Path d="M2 12h2l3-3 3 6 3-3 3 3h6" />
      <Path d="M2 12l3 3 3-6 3 3 3-3 3 3h6" />
    </Svg>
  );
}
