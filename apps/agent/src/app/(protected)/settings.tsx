import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Collapsible } from "react-native-fast-collapsible";
import { fetch } from "expo/fetch";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withDelay,
  withSpring,
  runOnJS,
} from "react-native-reanimated";

import { useMcpClient } from "@/client";
import { toError } from "@/shared/errors";
import usePlatform from "@/hooks/usePlatform";
import useSettings from "@/hooks/useSettings";
import useColors from "@/hooks/useColors";
import Container from "@/components/layout/Container";
import Header from "@/components/layout/Header";
import Page from "@/components/layout/Page";
import Footer from "@/components/layout/Footer";
import ChangePasswordForm from "@/components/forms/ChangePasswordForm";
import { useAlerts } from "@/components/Alerts";
import { useDialog } from "@/components/Dialog";
import McpAutoapproveForm from "@/components/forms/McpAutoaproveForm";
import ProfileDetailsForm from "@/components/forms/ProfileDetailsForm";

const sections = [
  {
    title: "Patient Profile",
    description: "Manage your personal health information, medical history, and care preferences.",
    icon: "person-circle",
    Component: () => {
      const { showAlert } = useAlerts();
      const { showDialog } = useDialog();
      const mcp = useMcpClient();
      const token = mcp.token;
      const [profile, setProfile] = useState<{
        firstName: string;
        lastName: string;
        email: string;
      }>();

      const getProfile = useCallback(
        async () =>
          fetch(
            new URL(process.env.EXPO_PUBLIC_MCP_URL + "/profile").toString(),
            { headers: { Authorization: `Bearer ${token}` } },
          )
            .then((r) => r.json())
            .catch((error) => {
              showAlert({
                type: "error",
                title: "Error",
                message: "Failed to fetch profile: " + toError(error).message,
              });
              return undefined;
            }),
        [token, showAlert],
      );

      const submit = useCallback(
        async (data: { firstName: string; lastName: string; email: string }) =>
          fetch(
            new URL(process.env.EXPO_PUBLIC_MCP_URL + "/profile").toString(),
            {
              method: "POST",
              body: JSON.stringify(data),
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
            },
          )
            .then(async (response) => {
              if (!response.ok) {
                const error = await response.json();
                throw new Error(
                  error.error || error.message || "Unknown error",
                );
              }
              setProfile(data);
              showDialog({
                type: "success",
                title: "Email updated successfully",
                message: "",
              });
            })
            .catch((error) => {
              showAlert({
                type: "error",
                title: "Error",
                message: "Failed to update profile: " + toError(error).message,
                timeout: 5000,
              });
            }),
        [token, showAlert, showDialog],
      );

      useEffect(() => {
        getProfile().then(setProfile);
      }, [getProfile]);

      return <ProfileDetailsForm user={profile} onSubmit={submit} />;
    },
  },
  {
    title: "Security",
    description: "Protect your PHI with enterprise-grade encryption, access controls, and compliance measures.",
    icon: "shield-checkmark",
    Component: () => {
      const { showAlert } = useAlerts();
      const { showDialog } = useDialog();
      const mcp = useMcpClient();
      const token = mcp.token;

      const submit = useCallback(
        async ({
          newPassword,
          currentPassword,
        }: {
          newPassword: string;
          currentPassword: string;
        }) => {
          try {
            const response = await fetch(
              new URL(
                process.env.EXPO_PUBLIC_MCP_URL + "/change-password",
              ).toString(),
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  newPassword,
                  currentPassword,
                }),
              },
            );
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            showDialog({
              type: "success",
              title: "Password changed successfully",
              message: "",
            });
          } catch (error) {
            console.error(error);
            showAlert({
              type: "error",
              title: "Failed to change password",
              message: toError(error).message,
            });
            throw error;
          }
        },
        [token, showAlert, showDialog],
      );

      return (
        <ChangePasswordForm
          mode={ChangePasswordForm.Mode.PASSWORD}
          onSubmit={submit}
          showLabels
          cardBackground
        />
      );
    },
  },
  {
    title: "AI Tools",
    description: "Configure evidence-based AI diagnostics, treatment recommendations, and health monitoring tools.",
    icon: "medical",
    Component: () => {
      const settings = useSettings();
      const { showAlert } = useAlerts();
      const { showDialog } = useDialog();

      const update = useCallback(
        async (value: boolean) => {
          try {
            await settings.set("autoApproveMcpTools", value);
            await settings.reload();
            showDialog({
              type: "success",
              title: "Settings applied successfully",
              message: "",
            });
          } catch (error) {
            console.error(error);
            showAlert({
              type: "error",
              title: "Failed to change a setting",
              message: toError(error).message,
            });
          }
        },
        [settings, showAlert, showDialog],
      );

      return (
        <McpAutoapproveForm
          currentValue={settings.autoApproveMcpTools}
          onSubmit={update}
        />
      );
    },
  },
];

export default function SettingsPage() {
  const mcp = useMcpClient();
  const colors = useColors();
  const { width, size } = usePlatform();
  const [activeIndex, setActiveIndex] = useState(0);
  const ActiveContent = sections[activeIndex]?.Component || (() => null);

  // Smooth fade-in animations for better UX
  const headerOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const sectionTransitionOpacity = useSharedValue(1);
  const sectionTransitionScale = useSharedValue(1);

  useEffect(() => {
    // Staggered fade-in animations
    headerOpacity.value = withDelay(100, withTiming(1, { duration: 500 }));
    contentOpacity.value = withDelay(300, withTiming(1, { duration: 500 }));
  }, []);

  // Light transition animation when switching sections
  const animateSectionChange = (newIndex: number) => {
    'worklet';
    sectionTransitionOpacity.value = withTiming(0, { duration: 150 }, () => {
      runOnJS(setActiveIndex)(newIndex);
      sectionTransitionOpacity.value = withTiming(1, { duration: 200 });
    });
    sectionTransitionScale.value = withSpring(0.98, { damping: 20, stiffness: 300 }, () => {
      sectionTransitionScale.value = withSpring(1, { damping: 15, stiffness: 200 });
    });
  };

  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  const sectionTransitionStyle = useAnimatedStyle(() => ({
    opacity: sectionTransitionOpacity.value,
    transform: [{ scale: sectionTransitionScale.value }],
  }));

  return (
    <Page>
      {/* Logo-themed background */}
      <LinearGradient
        colors={['rgba(255, 153, 153, 0.08)', 'rgba(69, 80, 91, 0.05)', 'rgba(255, 254, 254, 0.03)']}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
        }}
      />


      <Container>
        <Header handleLogout={mcp.disconnect} />

        <Animated.View style={[{
          flex: 1
        }, contentStyle]}>
          {size.w.lg ? (
          <View style={{
            flex: 1,
            flexDirection: "row",
            gap: 32,
            paddingVertical: 64,
            alignItems: "flex-start",
          }}>
            <View style={{ flex: 1, gap: 16 }}>
              {sections.map((section, index) => (
                <TouchableOpacity
                  onPress={() => animateSectionChange(index)}
                  disabled={index === activeIndex}
                  key={index}
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.card,
                      borderRadius: 16,
                      padding: 20,
                      shadowColor: colors.primary,
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.1,
                      shadowRadius: 8,
                      elevation: 3,
                    },
                    index === activeIndex && {
                      backgroundColor: colors.primary,
                      borderLeftWidth: 4,
                      borderLeftColor: colors.primary,
                    },
                  ]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <Ionicons
                      name={section.icon as any}
                      size={24}
                      color={index === activeIndex ? colors.primaryText : colors.primary}
                      style={{ marginRight: 12 }}
                    />
                    <Text
                      style={[
                        styles.sectionTitle,
                        {
                          color: colors.text,
                          fontSize: 18,
                          fontWeight: "600",
                          fontFamily: "SpaceGrotesk_600SemiBold"
                        },
                        index === activeIndex && { color: colors.primaryText },
                      ]}
                    >
                      {section.title}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.sectionDescription,
                      {
                        color: colors.text,
                        opacity: 0.7,
                        lineHeight: 20,
                        fontSize: 14
                      },
                      index === activeIndex && { color: colors.primaryText, opacity: 0.9 },
                    ]}
                  >
                    {section.description}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Animated.View style={[{ flex: 1 }, sectionTransitionStyle]}>
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    width: "100%",
                    borderRadius: 16,
                    padding: 24,
                    shadowColor: colors.primary,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 8,
                    elevation: 3,
                  },
                ]}
              >
                <ActiveContent />
              </View>
            </Animated.View>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <ScrollView
              style={{
                flex: 1,
                paddingVertical: size.w.sm ? 16 : 32,
                paddingHorizontal: size.w.sm ? 8 : 16
              }}
              contentContainerStyle={{
                paddingBottom: 32,
              }}
            >
              {sections.map((section, index) => (
                <View
                  key={index}
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.card,
                      marginBottom: size.w.sm ? 16 : 24,
                      borderRadius: 16,
                      shadowColor: colors.primary,
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.1,
                      shadowRadius: 8,
                      elevation: 3,
                      marginHorizontal: size.w.sm ? 8 : 16,
                    },
                  ]}
                >
                  <TouchableOpacity
                    onPress={() =>
                      setActiveIndex((currentIndex) =>
                        currentIndex === index ? -1 : index,
                      )
                    }
                    style={{ padding: 20 }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                      <Ionicons
                        name={section.icon as any}
                        size={24}
                        color={colors.primary}
                        style={{ marginRight: 12 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[
                          styles.sectionTitle,
                          {
                            color: colors.text,
                            fontSize: 18,
                            fontWeight: "600",
                            fontFamily: "SpaceGrotesk_600SemiBold"
                          }
                        ]}>
                          {section.title}
                        </Text>
                      </View>
                      <Ionicons
                        name={index === activeIndex ? "chevron-up" : "chevron-down"}
                        size={20}
                        color={colors.text}
                        style={{ opacity: 0.5 }}
                      />
                    </View>
                    <Text style={[
                      styles.sectionDescription,
                      {
                        color: colors.text,
                        opacity: 0.7,
                        lineHeight: 20,
                        fontSize: 14
                      }
                    ]}>
                      {section.description}
                    </Text>
                  </TouchableOpacity>
                  <Collapsible isVisible={index === activeIndex}>
                    <View style={{ height: 32 }} />
                    <section.Component />
                  </Collapsible>
                </View>
            ))}
          </ScrollView>
          </View>
        )}
        </Animated.View>
        <Footer />
      </Container>
    </Page>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 24,
    overflow: "hidden",
  },
  sectionTitle: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 28,
    lineHeight: 48,
    marginBottom: 8,
  },
  sectionDescription: {
    fontFamily: "Manrope_400Regular",
    fontSize: 16,
    lineHeight: 16,
  },
});
