import Svg, { SvgProps, Path } from "react-native-svg";

export default function ShieldIcon(props: SvgProps) {
  return (
    <Svg fill="none" {...props}>
      <Path d="M12 2l8 3v7c0 5.55-3.84 10.74-9 12-5.16-1.26-9-6.45-9-12V5l8-3z" />
      <Path d="M12 8v4m0 4h.01" />
    </Svg>
  );
}
