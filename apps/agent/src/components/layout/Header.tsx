import LayoutPill from "./LayoutPill";
import HeaderLogo from "./Header/HeaderLogo";
import HeaderNav from "./Header/HeaderNav";
import { View, Pressable } from "react-native";
import { useState } from "react";
import useColors from "@/hooks/useColors";
import usePlatform from "@/hooks/usePlatform";
import Ionicons from "@expo/vector-icons/Ionicons";

export default function Header({
  mode = "default",
  handleLogout,
}: {
  mode?: "default" | "login";
  handleLogout?: () => void;
}) {
  const colors = useColors();
  const { size } = usePlatform();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Mobile menu should only show on default mode and small screens
  const showMobileMenu = mode === "default" && size.w.sm;

  return (
    <LayoutPill>
      {mode !== "login" && (
        <HeaderLogo
          image={require("../../assets/medsy-logo.png")}
          textFont="SpaceGrotesk_700Bold"
          style={[
            size.w.sm ? { flex: 1 } : { flex: 1, marginRight: 24 }
          ]}
        />
      )}

      {mode === "default" && !showMobileMenu && (
        <>
          <HeaderNav style={{ flex: 1, justifyContent: "flex-end" }}>
          <HeaderNav.Link href="/chat" text="Health Assistant" />
            <HeaderNav.Link text="Settings" href="/settings" />
            {handleLogout && (
              <HeaderNav.Link text="Logout" onPress={handleLogout} />
            )}
          </HeaderNav>
        </>
      )}

      {showMobileMenu && (
        <Pressable
          onPress={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{
            padding: 8,
            borderRadius: 8,
            backgroundColor: colors.primary + "20",
          }}
        >
          <Ionicons
            name={mobileMenuOpen ? "close" : "menu"}
            size={24}
            color={colors.primary}
          />
        </Pressable>
      )}

      {showMobileMenu && mobileMenuOpen && (
        <View
          style={{
            position: "absolute",
            top: "100%",
            left: 16,
            right: 16,
            backgroundColor: colors.card,
            borderRadius: 16,
            marginTop: 8,
            padding: 16,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 8,
            zIndex: 1000,
          }}
        >
          <HeaderNav.Link
            href="/chat"
            text="Health Assistant"
            onPress={() => setMobileMenuOpen(false)}
          />
          <View style={{ height: 12 }} />
          <HeaderNav.Link
            text="Settings"
            href="/settings"
            onPress={() => setMobileMenuOpen(false)}
          />
          <View style={{ height: 12 }} />
          {handleLogout && (
            <HeaderNav.Link
              text="Logout"
              onPress={() => {
                setMobileMenuOpen(false);
                handleLogout();
              }}
            />
          )}
        </View>
      )}
    </LayoutPill>
  );
}
