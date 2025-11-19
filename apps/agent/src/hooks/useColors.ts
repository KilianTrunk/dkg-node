import { useMemo } from "react";

const lightTheme = {
  background: "#FFFEFE", // Logo white background
  backgroundFlat: "#F8FAFC", // Soft white
  text: "#45505B", // Logo dark gray text
  primary: "#FF9999", // Logo pink (brand color)
  primaryText: "#FFFEFE", // White text on pink
  secondary: "#46515C", // Logo medium gray
  tertiary: "#47525D", // Logo darker gray
  accent: "#45505B", // Logo base gray
  card: "#FFFEFE", // Logo white cards
  cardText: "#45505B", // Logo dark gray text
  card2: "#00000005", // Very light overlay
  input: "#E2E8F0", // Light gray input for better contrast
  placeholder: "#9CA3AF", // Muted placeholder
  border: "#E2E8F0", // Light border
  error: "#DC2626", // Professional red
  success: "#059669", // Professional green
  warning: "#D97706", // Professional amber
  info: "#2563EB", // Professional blue
};

export type Color = keyof typeof lightTheme;

export const Colors = lightTheme;

export default function useColors() {
  return useMemo(() => {
    const getTextColor = (backgroundColor: Color) => {
      return backgroundColor === "card"
        ? Colors.cardText
        : backgroundColor === "primary"
          ? Colors.primaryText
          : Colors.text;
    };
    return {
      ...Colors,
      getTextColor,
    };
  }, []);
}
