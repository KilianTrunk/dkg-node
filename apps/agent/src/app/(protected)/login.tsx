import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect } from "react";
import { View, Text } from "react-native";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import { fetch } from "expo/fetch";
import { Image } from "expo-image";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { motion } from "framer-motion";
import useColors from "@/hooks/useColors";

import { clientUri, useMcpClient } from "@/client";
import { AuthError, login } from "@/shared/auth";
import Page from "@/components/layout/Page";
import Container from "@/components/layout/Container";
import Footer from "@/components/layout/Footer";
import FormTitle from "@/components/forms/FormTitle";
import LoginForm from "@/components/forms/LoginForm";
import usePlatform from "@/hooks/usePlatform";

const getErrorMessage = (err: any) => {
  if (!(err instanceof AuthError)) return "Unknown error occurred!";
  switch (err.code) {
    case AuthError.Code.INVALID_CREDENTIALS:
      return "Invalid username or password";
    case AuthError.Code.NO_REDIRECT_URL:
      return "No redirect URL provided";
    case AuthError.Code.INTERNAL_ERROR:
      return "Internal server error";
    default:
      return "Unknown auth error occurred!";
  }
};

export default function Login() {
  SplashScreen.hide();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const colors = useColors();
  const { size } = usePlatform();

    // Corporate login animations - minimal and smooth
  const logoOpacity = useSharedValue(0);
  const formOpacity = useSharedValue(0);

  useEffect(() => {
      // Simple fade-in animations
      logoOpacity.value = withDelay(200, withTiming(1, { duration: 600 }));
      formOpacity.value = withDelay(400, withTiming(1, { duration: 600 }));
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
  }));

  const formStyle = useAnimatedStyle(() => ({
    opacity: formOpacity.value,
  }));

  const tryLogin = useCallback(
    async ({
      email,
      password,
      rememberMe,
    }: {
      email: string;
      password: string;
      rememberMe: boolean;
    }) => {
      try {
        const url = await login({
          code: code ?? "",
          credentials: { email, password },
          rememberMe,
          fetch: (url, opts) => fetch(url.toString(), opts as any),
        });
        if (url.startsWith(clientUri))
          router.navigate({
            pathname: url.substring(clientUri.length) as any,
          });
        else Linking.openURL(url);
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        throw new Error(errorMessage);
      }
    },
    [code],
  );

  const { connected } = useMcpClient();
  if (connected) return <Redirect href="/" />;

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


      <Container style={{ justifyContent: "center", minHeight: "100%" }}>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            paddingVertical: size.w.sm ? 24 : 48,
            maxWidth: 500,
            width: "100%",
            alignSelf: "center",
          }}
        >
          {/* Medsy Logo Section */}
          <Animated.View style={[{
            alignItems: "center",
            marginBottom: size.w.sm ? 32 : 48,
          }, logoStyle]}>
            <Image
              source={require("@/assets/medsy-logo.png")}
              style={{ width: 128, height: 64 }}
              testID="login-logo"
              contentFit="contain"
            />
            <Text style={{
              fontSize: 32,
              fontWeight: "700",
              color: colors.primary,
              marginBottom: 12,
              fontFamily: "SpaceGrotesk_700Bold",
              textAlign: "center",
            }}>
              Medsy Health AI
            </Text>
            <Text style={{
              fontSize: 18,
              color: colors.text,
              textAlign: "center",
              opacity: 0.9,
              lineHeight: 24,
              marginBottom: 8,
              fontFamily: "Manrope_500Medium",
            }}>
              Your Trusted Medical AI Assistant
            </Text>
            <Text style={{
              fontSize: 14,
              color: colors.secondary,
              textAlign: "center",
              opacity: 0.8,
              lineHeight: 20,
              fontFamily: "Manrope_400Regular",
            }}>
              HIPAA Compliant • Evidence-Based • Patient-Centered Care
            </Text>
          </Animated.View>

          {/* Login Form Section */}
          <Animated.View style={[{
            width: "100%",
            maxWidth: 450,
            backgroundColor: colors.card,
            borderRadius: size.w.sm ? 20 : 24,
            padding: size.w.sm ? 24 : 32,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.15,
            shadowRadius: 16,
            elevation: 8,
            borderWidth: 1,
            borderColor: colors.border,
          }, formStyle]}>
            <View style={{ alignItems: "center", marginBottom: 28 }}>
              <Text style={{
                fontSize: 26,
                fontWeight: "600",
                color: colors.text,
                marginBottom: 10,
                fontFamily: "SpaceGrotesk_600SemiBold",
              }}>
                Secure Login
              </Text>
              <Text style={{
                fontSize: 15,
                color: colors.text,
                textAlign: "center",
                opacity: 0.8,
                lineHeight: 22,
                fontFamily: "Manrope_400Regular",
              }}>
                Access your personalized health insights, medical records, and AI-powered healthcare assistant
              </Text>
            </View>

            <FormTitle
              title=""
              subtitle=""
            />
            <LoginForm onSubmit={tryLogin} />
          </Animated.View>

        </View>

        <Footer mode="login" />
      </Container>
    </Page>
  );
}
