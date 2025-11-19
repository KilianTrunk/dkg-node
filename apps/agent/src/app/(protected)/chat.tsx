import React, { useCallback, useRef, useState, useEffect } from "react";
import { View, Platform, KeyboardAvoidingView, ScrollView, Text } from "react-native";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
import { fetch } from "expo/fetch";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
//import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  parseSourceKAContent,
  SourceKA,
} from "@dkg/plugin-dkg-essentials/utils";

import { useMcpClient } from "@/client";
import useMcpToolsSession from "@/hooks/useMcpToolsSession";
import useColors from "@/hooks/useColors";
import usePlatform from "@/hooks/usePlatform";
import Page from "@/components/layout/Page";
import Container from "@/components/layout/Container";
import Header from "@/components/layout/Header";
import Chat from "@/components/Chat";
import { SourceKAResolver } from "@/components/Chat/Message/SourceKAs/CollapsibleItem";
import { useAlerts } from "@/components/Alerts";

import {
  type ChatMessage,
  type ToolCall,
  type ToolCallResultContent,
  makeCompletionRequest,
  toContents,
} from "@/shared/chat";
import {
  FileDefinition,
  parseFilesFromContent,
  serializeFiles,
  uploadFiles,
} from "@/shared/files";
import { toError } from "@/shared/errors";
import useSettings from "@/hooks/useSettings";

export default function ChatPage() {
  const colors = useColors();
  const { isNativeMobile, isWeb, width } = usePlatform();
  const safeAreaInsets = useSafeAreaInsets();
  const { showAlert } = useAlerts();

  const settings = useSettings();
  const mcp = useMcpClient();
  const tools = useMcpToolsSession(mcp.tools);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const chatMessagesRef = useRef<ScrollView>(null);

  const isLandingScreen = !messages.length && !isNativeMobile;

  // Corporate animations - minimal and smooth
  const landingOpacity = useSharedValue(0);

  useEffect(() => {
    if (isLandingScreen) {
      landingOpacity.value = withDelay(200, withTiming(1, { duration: 600 }));
    }
  }, [isLandingScreen]);

  const landingStyle = useAnimatedStyle(() => ({
    opacity: landingOpacity.value,
  }));

  async function callTool(tc: ToolCall & { id: string }) {
    tools.saveCallInfo(tc.id, { input: tc.args, status: "loading" });

    return mcp
      .callTool({ name: tc.name, arguments: tc.args }, undefined, {
        timeout: 300000,
        maxTotalTimeout: 300000,
      })
      .then((result) => {
        tools.saveCallInfo(tc.id, {
          input: tc.args,
          status: "success",
          output: result.content,
        });

        return sendMessage({
          role: "tool",
          tool_call_id: tc.id,
          content: result.content as ToolCallResultContent,
        });
      })
      .catch((err) => {
        tools.saveCallInfo(tc.id, {
          input: tc.args,
          status: "error",
          error: err.message,
        });

        return sendMessage({
          role: "tool",
          tool_call_id: tc.id,
          content: "Error occurred while calling tool: " + err.message,
          isError: true,
        });
      });
  }

  async function cancelToolCall(tc: ToolCall & { id: string }) {
    tools.saveCallInfo(tc.id, { input: tc.args, status: "cancelled" });

    return sendMessage({
      role: "tool",
      tool_call_id: tc.id,
      content: "Tool call was cancelled by user",
    });
  }

  async function sendMessage(newMessage: ChatMessage) {
    const kaContents: any[] = [];
    if (newMessage.role === "tool") {
      const otherContents: any[] = [];
      for (const c of toContents(newMessage.content) as ToolCallResultContent) {
        const kas = parseSourceKAContent(c);
        if (kas) kaContents.push(c);
        else otherContents.push(c);
      }
      newMessage.content = otherContents;
    }

    setMessages((prevMessages) => [...prevMessages, newMessage]);

    if (!mcp.token) throw new Error("Unauthorized");

    setIsGenerating(true);
    const completion = await makeCompletionRequest(
      {
        messages: [...messages, newMessage],
        tools: tools.enabled,
      },
      {
        fetch: (url, opts) => fetch(url.toString(), opts as any) as any,
        bearerToken: mcp.token,
      },
    );

    if (newMessage.role === "tool") {
      completion.content = toContents(completion.content);
      completion.content.push(...kaContents);
    }

    setMessages((prevMessages) => [...prevMessages, completion]);
    setIsGenerating(false);
    setTimeout(() => chatMessagesRef.current?.scrollToEnd(), 100);
  }

  const kaResolver = useCallback<SourceKAResolver>(
    async (ual) => {
      try {
        const resource = await mcp.readResource({ uri: ual });
        const content = resource.contents[0]?.text as string;
        if (!content) throw new Error("Resource not found");

        const parsedContent = JSON.parse(content);
        const resolved = {
          assertion: parsedContent.assertion,
          lastUpdated: new Date(
            parsedContent.metadata
              .at(0)
              ?.[
                "https://ontology.origintrail.io/dkg/1.0#publishTime"
              ]?.at(0)?.["@value"] ?? Date.now(),
          ).getTime(),
          txHash: parsedContent.metadata
            .at(0)
            ?.["https://ontology.origintrail.io/dkg/1.0#publishTx"]?.at(0)?.[
            "@value"
          ],
          publisher: parsedContent.metadata
            .at(0)
            ?.["https://ontology.origintrail.io/dkg/1.0#publishedBy"]?.at(0)
            ?.["@id"]?.split("/")
            .at(1),
        };

        // hotfix, KC metadata not present in KA metadata
        if (!resolved.txHash || !resolved.publisher) {
          const splitUal = ual.split("/");
          splitUal.pop();
          const kcUal = splitUal.join("/");
          const resource = await mcp.readResource({ uri: kcUal });
          const content = resource.contents[0]?.text as string;
          if (!content) {
            resolved.publisher = "unknown";
            resolved.txHash = "unknown";
            return resolved;
          }

          const parsedContent = JSON.parse(content);
          resolved.txHash =
            parsedContent.metadata
              .at(0)
              ?.["https://ontology.origintrail.io/dkg/1.0#publishTx"]?.at(0)?.[
              "@value"
            ] ?? "unknown";
          resolved.publisher =
            parsedContent.metadata
              .at(0)
              ?.["https://ontology.origintrail.io/dkg/1.0#publishedBy"]?.at(0)
              ?.["@id"]?.split("/")
              .at(1) ?? "unknown";
        }

        return resolved;
      } catch (error) {
        showAlert({
          type: "error",
          title: "Failed to resolve Knowledge Asset",
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    [mcp, showAlert],
  );

  console.debug("Messages:", messages);
  console.debug("Tools (enabled):", tools.enabled);

  return (
    <Page style={{ flex: 1, position: "relative", marginBottom: 0 }}>
      {/* Logo-themed background with gradient */}
      <LinearGradient
        colors={['rgba(255, 153, 153, 0.06)', 'rgba(69, 80, 91, 0.04)', 'rgba(255, 254, 254, 0.02)']}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
        }}
      />


      <Chat>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={20}
          style={[
            { flex: 1, position: "relative" },
            isLandingScreen
              ? { justifyContent: "flex-start" }
              : { justifyContent: "flex-end" },
          ]}
        >
          <Container
            style={[
              { paddingBottom: 0 },
              isLandingScreen && { flex: null as any },
            ]}
          >
            <Header handleLogout={() => mcp.disconnect()} />
            <Chat.Messages
              ref={chatMessagesRef}
              style={[
                {
                  width: "100%",
                  marginHorizontal: "auto",
                  maxWidth: 800,
                },
                width >= 800 + 48 * 2 + 20 * 2 && {
                  maxWidth: 800 + 48 * 2,
                  paddingRight: 48,
                },
              ]}
            >
              {messages.map((m, i) => {
                if (m.role !== "user" && m.role !== "assistant") return null;

                const kas: SourceKA[] = [];
                const files: FileDefinition[] = [];
                const images: { uri: string }[] = [];
                const text: string[] = [];

                for (const c of toContents(m.content)) {
                  if (c.type === "image_url") {
                    images.push({ uri: c.image_url });
                    continue;
                  }

                  if (c.type === "text") {
                    const k = parseSourceKAContent(c as unknown as any);
                    if (k) {
                      kas.push(...k);
                      continue;
                    }

                    const f = parseFilesFromContent(c);
                    if (f.length) {
                      for (const file of f)
                        if (file.mimeType?.startsWith("image/"))
                          images.push({ uri: file.uri });
                        else files.push(file);
                      continue;
                    }

                    text.push(c.text);
                  }
                }

                const isLastMessage = i === messages.length - 1;
                const isIdle = !isGenerating && !m.tool_calls?.length;

                const isMedsyMessage = m.role === "assistant";

                // Determine assistant state for animations
                let assistantState: 'idle' | 'thinking' | 'speaking' | 'processing' = 'idle';
                if (isMedsyMessage) {
                  if (isLastMessage && isGenerating) {
                    assistantState = m.tool_calls?.length ? 'processing' : 'speaking';
                  } else if (!isLastMessage && !isIdle) {
                    assistantState = 'thinking';
                  }
                }

                return (
                  <Chat.Message
                    key={i}
                    icon={m.role as "user" | "assistant"}
                    isMedsy={isMedsyMessage}
                    assistantState={assistantState}
                    style={{ gap: 8 }}
                  >
                    {/* Source Knowledge Assets */}
                    <Chat.Message.SourceKAs kas={kas} resolver={kaResolver} />

                    {/* Images */}
                    {images.map((image, i) => (
                      <Chat.Message.Content.Image
                        key={i}
                        url={image.uri}
                        authToken={mcp.token}
                      />
                    ))}

                    {/* Files */}
                    {files.map((file, i) => (
                      <Chat.Message.Content.File key={i} file={file} />
                    ))}

                    {/* Text (markdown) */}
                    {text.map((c, i) => (
                      <Chat.Message.Content.Text
                        key={i}
                        text={c.replaceAll(/<think>.*?<\/think>/gs, "")}
                        isMedsy={isMedsyMessage}
                      />
                    ))}

                    {/* Tool calls */}
                    {m.tool_calls?.map((_tc, i) => {
                      const tcId = _tc.id || i.toString();
                      const tc = {
                        ..._tc,
                        id: tcId,
                        info: tools.getCallInfo(tcId),
                      };
                      const toolInfo = mcp.getToolInfo(tc.name);

                      const title = toolInfo
                        ? `${toolInfo.name} - ${mcp.name} (MCP Server)`
                        : tc.name;
                      const description = toolInfo?.description;
                      const autoconfirm =
                        (settings.autoApproveMcpTools ||
                          tools.isAllowedForSession(tc.name)) &&
                        !tc.info;

                      return (
                        <Chat.Message.ToolCall
                          key={tc.id}
                          title={title}
                          description={description}
                          status={tc.info?.status ?? "init"}
                          input={tc.info?.input ?? _tc.args}
                          output={tc.info?.output ?? tc.info?.error}
                          autoconfirm={autoconfirm}
                          onConfirm={(allowForSession) => {
                            callTool(tc);
                            if (allowForSession) tools.allowForSession(tc.name);
                          }}
                          onCancel={() => cancelToolCall(tc)}
                        />
                      );
                    })}

                    {/* Actions at the bottom */}
                    {m.role === "assistant" && isLastMessage && isIdle && (
                      <Chat.Message.Actions
                        style={{ marginVertical: 16 }}
                        onCopyAnswer={() => {
                          Clipboard.setStringAsync(text.join("\n").trim());
                        }}
                        onStartAgain={() => {
                          setMessages([]);
                          tools.reset();
                        }}
                      />
                    )}
                  </Chat.Message>
                );
              })}
              {isGenerating && <Chat.Thinking />}
            </Chat.Messages>
          </Container>

          <View
            style={[
              { width: "100%" },
              isLandingScreen && {
                marginTop: isNativeMobile ? 24 : 120, // Less space on mobile since we reduced landing screen margin
              },
              isNativeMobile && {
                backgroundColor: colors.backgroundFlat,
                paddingBottom: safeAreaInsets.bottom,
                height: 2 * 56 + safeAreaInsets.bottom + 20,
              },
            ]}
          >
            <Container
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
    {isLandingScreen && (
      <Animated.View
        style={[{
          alignItems: "center",
          marginBottom: isNativeMobile ? 16 : 32, // Less margin on mobile
        }, landingStyle]}
      >

        <Animated.View
          style={[{
            alignItems: "center",
            marginBottom: 20,
          }, landingStyle]}
        >
          <Text style={{
            fontSize: isNativeMobile ? 28 : 36, // Smaller title on mobile
            fontWeight: "700",
            color: colors.primary,
            marginBottom: isNativeMobile ? 12 : 16, // Less margin on mobile
            fontFamily: "SpaceGrotesk_700Bold",
            textAlign: "center",
          }}>
            Medsy Health AI Assistant
          </Text>
          <Text style={{
            fontSize: isNativeMobile ? 18 : 20, // Slightly smaller on mobile
            color: colors.text,
            textAlign: "center",
            lineHeight: isNativeMobile ? 24 : 28, // Tighter line height on mobile
            paddingHorizontal: isNativeMobile ? 20 : 24, // Less padding on mobile
            opacity: 0.9,
            marginBottom: isNativeMobile ? 8 : 12, // Less margin on mobile
            fontFamily: "Manrope_500Medium",
          }}>
            Your Intelligent Healthcare Companion
          </Text>
          <Text style={{
            fontSize: isNativeMobile ? 14 : 16, // Smaller font on mobile
            color: colors.text,
            textAlign: "center",
            lineHeight: isNativeMobile ? 20 : 24, // Tighter line height on mobile
            paddingHorizontal: isNativeMobile ? 16 : 20, // Less padding on mobile
            opacity: 0.7,
            marginBottom: isNativeMobile ? 8 : 12, // Less margin on mobile
            fontFamily: "Manrope_400Regular",
          }}>
            {isNativeMobile
              ? "Get personalized health insights and guidance"
              : "Get personalized health insights, symptom analysis, medication guidance, and evidence-based wellness recommendations"
            }
          </Text>
        </Animated.View>

        <Animated.View
          style={{
            marginTop: isNativeMobile ? 12 : 20, // Less margin on mobile
            marginBottom: isNativeMobile ? 32 : 60, // More space before input
            alignItems: 'center',
          }}
        >
          <Text style={{
            fontSize: isNativeMobile ? 13 : 14, // Smaller text on mobile
            color: colors.text,
            textAlign: "center",
            opacity: 0.7,
            fontFamily: "Manrope_400Regular",
            maxWidth: isNativeMobile ? 280 : 300, // Slightly narrower on mobile
          }}>
            {isNativeMobile
              ? "Start a conversation below"
              : "Ask me about symptoms, medications, wellness tips, or any health-related questions"
            }
          </Text>
        </Animated.View>
      </Animated.View>
    )}
              <Chat.Input
                onSendMessage={sendMessage}
                onUploadFiles={(assets) =>
                  uploadFiles(
                    new URL(process.env.EXPO_PUBLIC_MCP_URL + "/blob"),
                    assets,
                    {
                      fieldName: "file",
                      uploadType: 1,
                      headers: { Authorization: `Bearer ${mcp.token}` },
                    },
                  ).then(({ successful, failed }) => {
                    if (failed.length) {
                      console.debug("Failed uploads:", failed);
                      showAlert({
                        type: "error",
                        title: "Upload error",
                        message: "Some uploads have failed!",
                        timeout: 5000,
                      });
                    }

                    return successful.map((data) => ({
                      ...data,
                      uri: new URL(
                        process.env.EXPO_PUBLIC_MCP_URL + "/blob/" + data.id,
                      ).toString(),
                    }));
                  })
                }
                onFileRemoved={(f) => {
                  fetch(
                    new URL(
                      process.env.EXPO_PUBLIC_MCP_URL + "/blob/" + f.id,
                    ).toString(),
                    {
                      method: "DELETE",
                      headers: { Authorization: `Bearer ${mcp.token}` },
                    },
                  ).catch((error) => {
                    console.debug("File removal error:", error);
                    showAlert({
                      type: "error",
                      title: "File removal error",
                      message: toError(error).message,
                      timeout: 5000,
                    });
                  });
                }}
                onUploadError={(error) => {
                  console.debug("Upload error:", error);
                  showAlert({
                    type: "error",
                    title: "Upload error",
                    message: error.message,
                    timeout: 5000,
                  });
                }}
                onAttachFiles={serializeFiles}
                authToken={mcp.token}
                tools={{
                  [mcp.name]: mcp.tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    enabled: tools.isEnabled(t.name),
                  })),
                }}
                onToolTick={(_, tool, enabled) => {
                  tools.toggle(tool, enabled);
                }}
                onToolServerTick={(_, enabled) => {
                  tools.toggleAll(enabled);
                }}
                disabled={isGenerating}
                style={[{ maxWidth: 800 }, isWeb && { pointerEvents: "auto" as any }]}
              />
            </Container>
          </View>
        </KeyboardAvoidingView>
      </Chat>
    </Page>
  );
}
