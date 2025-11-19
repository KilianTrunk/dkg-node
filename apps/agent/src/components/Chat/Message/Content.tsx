import React from "react";
import { View } from "react-native";
import { Image, useImage } from "expo-image";
import type { MessageContentComplex } from "@langchain/core/messages";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";

import Markdown from "@/components/Markdown";
import { FileDefinition } from "@/shared/files";

import AttachmentChip from "../Input/AttachmentChip";

function TextContent(props: { text: string; isMedsy?: boolean }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(10);

  React.useEffect(() => {
    opacity.value = withDelay(100, withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }));
    translateY.value = withDelay(100, withTiming(0, { duration: 300, easing: Easing.out(Easing.ease) }));
  }, [props.text]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Markdown
        testID="chat-message-text"
        style={props.isMedsy ? {
          body: { fontFamily: 'System', lineHeight: 24 },
          paragraph: { marginBottom: 12 },
        } : undefined}
      >
        {props.text}
      </Markdown>
    </Animated.View>
  );
}

function ImageContent(props: { url: string; authToken?: string }) {
  const image = useImage(
    props.authToken
      ? {
          uri: props.url,
          headers: { Authorization: `Bearer ${props.authToken}` },
        }
      : props.url,
  );

  return (
    <Image
      source={image}
      style={{
        height: 300,
        width: !image ? 300 : image.width / (image.height / 300),
        borderRadius: 12,
      }}
      contentFit="cover"
    />
  );
}

function FileContent(props: { file: FileDefinition }) {
  return (
    <View style={{ display: "flex", flexDirection: "row" }}>
      <AttachmentChip file={props.file} />
    </View>
  );
}

export default function ChatMessageContent({
  content: c,
  isMedsy = false,
}: {
  content: MessageContentComplex;
  isMedsy?: boolean;
}) {
  if (c.type === "text" && c.text) {
    return <TextContent text={c.text} isMedsy={isMedsy} />;
  }
  if (c.type === "image_url") {
    return <ImageContent url={c.image_url?.url ?? c.image_url} />;
  }
  if (c.type === "file") {
    return (
      <FileContent
        file={{
          id: c.file.file_id ?? c.file.filename,
          name: c.file.filename,
          uri: c.file.file_data,
        }}
      />
    );
  }
  return null;
}

ChatMessageContent.Text = TextContent;
ChatMessageContent.Image = ImageContent;
ChatMessageContent.File = FileContent;
