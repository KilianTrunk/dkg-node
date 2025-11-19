import { Colors } from "./useColors";

export default function useThemeColor(
  color: keyof typeof Colors,
) {
  return Colors[color];
}
