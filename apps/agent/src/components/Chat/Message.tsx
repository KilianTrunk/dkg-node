import { View, ViewProps } from "react-native";
import useColors from "@/hooks/useColors";

import IconUser from "./Message/IconUser";
import IconAssistant, { AssistantState } from "./Message/IconAssistant";
import ChatMessageContent from "./Message/Content";
import ChatMessageToolCall from "./Message/ToolCall";
import ChatMessageActions from "./Message/Actions";
import ChatMessageSourceKAs from "./Message/SourceKAs";

export default function ChatMessage({
  icon,
  isMedsy = false,
  assistantState = 'idle',
  ...props
}: ViewProps & {
  icon: "user" | "assistant";
  isMedsy?: boolean;
  assistantState?: AssistantState;
}) {
  const colors = useColors();

  return (
    <View
      style={[
        {
          gap: 16,
          flexDirection: "row",
          width: "100%",
          marginBottom: 16,
          paddingHorizontal: 16,
          paddingVertical: 8,
        },
        isMedsy && {
          backgroundColor: 'rgba(255, 153, 153, 0.08)',
          borderRadius: 12,
          borderLeftWidth: 4,
          borderLeftColor: '#FF9999',
          marginHorizontal: 8,
        }
      ]}
    >
      <View style={{ width: 32 }}>
        {icon === "user" && <IconUser />}
        {icon === "assistant" && <IconAssistant state={assistantState} />}
      </View>
      <View
        {...props}
        style={[
          { flex: 1 },
          isMedsy && {
            paddingLeft: 8,
          },
          props.style
        ]}
      />
    </View>
  );
}

ChatMessage.Icon = {
  User: IconUser,
  Assistant: IconAssistant,
};
ChatMessage.Content = ChatMessageContent;
ChatMessage.ToolCall = ChatMessageToolCall;
ChatMessage.Actions = ChatMessageActions;
ChatMessage.SourceKAs = ChatMessageSourceKAs;
