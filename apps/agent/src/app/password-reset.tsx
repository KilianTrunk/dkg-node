import { useCallback } from "react";
import { View } from "react-native";
import { fetch } from "expo/fetch";
import { router, useGlobalSearchParams } from "expo-router";

import Container from "@/components/layout/Container";
import Header from "@/components/layout/Header";
import Page from "@/components/layout/Page";
import { useAlerts } from "@/components/Alerts";
import { useDialog } from "@/components/Dialog";
import FormTitle from "@/components/forms/FormTitle";
import ChangePasswordForm from "@/components/forms/ChangePasswordForm";
import RequestPasswordResetForm from "@/components/forms/RequestPasswordResetForm";
import { toError } from "@/shared/errors";

export default function PasswordResetPage() {
  const { code } = useGlobalSearchParams<{ code?: string }>();
  const { showAlert } = useAlerts();
  const { showDialog } = useDialog();

  const sendResetLink = useCallback(
    async ({ email }: { email: string }) => {
      try {
        const response = await fetch(
          new URL(
            process.env.EXPO_PUBLIC_MCP_URL + "/password-reset",
          ).toString(),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ email }),
          },
        );
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        showDialog({
          type: "success",
          title: "Email sent!",
          message:
            "If an account exists with this email, you’ll receive a password reset link shortly.",
        });
      } catch (error) {
        showAlert({
          type: "error",
          title: "Error sending reset link",
          message: toError(error).message,
          timeout: 5000,
        });
        throw error;
      }
    },
    [showAlert, showDialog],
  );

  const resetPassword = useCallback(
    async ({ newPassword }: { newPassword: string }) => {
      try {
        const response = await fetch(
          new URL(
            process.env.EXPO_PUBLIC_MCP_URL + "/password-reset/confirm",
          ).toString(),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ newPassword, code }),
          },
        );
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        showDialog({
          type: "success",
          title: "Updated password",
          message:
            "Your password has been updated. You can now log in with your new credentials.",
          button: {
            text: "Go to Login",
            onPress: () => {
              router.push("/login");
            },
            hideCloseButton: true,
          },
        });
      } catch (error) {
        console.error(error);
        if (error instanceof TypeError) {
          showAlert({
            type: "error",
            title: "Error sending reset link",
            message: toError(error).message + "\n" + "Try again later.",
            timeout: 5000,
          });
        } else {
          showDialog({
            type: "error",
            title: "Expired or used link",
            message:
              "This reset link is no longer valid. Please request a new one.",
            button: {
              text: "Request new link",
              onPress: () => {
                router.setParams({ code: undefined });
              },
              hideCloseButton: true,
            },
          });
        }
        throw error;
      }
    },
    [code, showAlert, showDialog],
  );

  return (
    <Page>
      <Container>
        <Header mode="login" />
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "flex-start",
            marginTop: 60,
          }}
        >
          {!code ? (
            <View style={{ width: "100%", padding: 15, maxWidth: 450 }}>
              <FormTitle
                title="Reset your password"
                subtitle="Enter the email associated with your Medsy Health AI account and we'll send you a secure link to reset your password."
              />
              <RequestPasswordResetForm onSubmit={sendResetLink} />
            </View>
          ) : (
            <View style={{ width: "100%", padding: 15, maxWidth: 480 }}>
              <FormTitle
                title="Create a new password"
                subtitle="Choose a strong password to secure your account."
              />
              <ChangePasswordForm
                style={{ paddingHorizontal: 30 }}
                onSubmit={resetPassword}
                mode={ChangePasswordForm.Mode.CODE}
              />
            </View>
          )}
        </View>
      </Container>
    </Page>
  );
}
