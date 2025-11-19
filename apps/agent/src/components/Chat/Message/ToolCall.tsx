import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import useColors from "@/hooks/useColors";
import Button from "@/components/Button";
import Checkbox from "@/components/Checkbox";
import { Collapsible } from "react-native-fast-collapsible";
import Spinner from "@/components/Spinner";

/**
 * Format structured analysis responses from Medsy tools
 */
function formatAnalysisResponse(data: any): string {
  if (data.analysisType === 'autonomous' && data.workflowResult) {
    const wf = data.workflowResult;
    const dkgUrl = wf.ual ? `https://dkg-testnet.origintrail.io/explore?ual=${encodeURIComponent(wf.ual)}` : 'N/A';
    return `✅ **Autonomous Health Analysis Complete!**

🤖 **Agent:** ${wf.agent?.name || 'Unknown'} (${wf.agent?.agentId || 'Unknown'})
📝 **Claim ID:** ${wf.claimId || 'N/A'}
📋 **Community Note:** ${wf.noteId || 'N/A'}
🔗 **DKG Permanent Record:** ${dkgUrl}

   **Full UAL:** ${wf.ual || 'N/A'}
   - Click the link above to view this analysis on the DKG blockchain
💰 **Auto-Stake:** ${wf.stakeId || 'N/A'} (1 TRAC)
⏱️ **Execution Time:** ${wf.executionTime || 0}ms

🔄 **Complete Workflow Executed:**
   1. AI-powered health claim analysis
   2. DKG Knowledge Asset publishing
   3. Community note creation
   4. Automatic TRAC token staking
   5. Consensus-based reward distribution (when threshold reached)

📊 **Analysis Results:**
   - Claim: "${data.claim || 'N/A'}"
   - Status: Published and staked
   - Consensus: Building... (minimum 3 stakes required)

🎯 **Next Steps:**
   - Other agents can stake on this note for consensus
   - Once consensus is reached, rewards will be distributed automatically
   - Premium access available via x402 micropayments`;
  } else if (data.analysisType === 'basic' && data.analysis) {
    const analysis = data.analysis;
    return `🩺 **Health Claim Analysis**

**Claim:** ${data.claim || 'N/A'}
**Verdict:** ${analysis.verdict?.toUpperCase() || 'UNKNOWN'}
**Confidence:** ${(analysis.confidence * 100).toFixed(1)}%

**Summary:** ${analysis.summary || 'N/A'}

**Sources:** ${analysis.sources?.join(', ') || 'N/A'}

**Claim ID:** ${data.claimId || 'N/A'} (save this for publishing)

💎 **Want premium access?** First publish this as a Community Note, then pay 1 TRAC for enhanced analysis with expert commentary, medical citations, statistical data, and bias assessment.

Let me know if you'd like me to publish this note!`;
  }

  // Fallback to formatted JSON
  return JSON.stringify(data, null, 2);
}

export default function ChatMessageToolCall({
  title,
  description,
  status,
  input,
  output,
  autoconfirm,
  onConfirm,
  onCancel,
}: {
  title: string;
  description?: string;
  status?: "init" | "loading" | "success" | "error" | "cancelled";
  input?: unknown;
  output?: unknown;
  autoconfirm?: boolean;
  onConfirm: (allowForSession: boolean) => void;
  onCancel: () => void;
}) {
  const colors = useColors();
  const [seeMore, setSeeMore] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [allowForSession, setAllowForSession] = useState(false);

  if (!status && autoconfirm) status = "loading";
  if (!status) status = "init";

  useEffect(() => {
    if (autoconfirm) onConfirm(true);
  }, [autoconfirm, onConfirm]);

  if (status === "init")
    return (
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.description, { color: colors.text }]}>
          {description}
        </Text>

        {/*<Text>{JSON.stringify(tc.args, null, 2)}</Text>*/}

        {!!input && (
          <View>
            <TouchableOpacity onPress={() => setSeeMore(!seeMore)}>
              <Text style={[styles.link, { color: colors.secondary }]}>
                {seeMore ? "Hide input" : "See input"}
              </Text>
            </TouchableOpacity>
            <Collapsible isVisible={seeMore}>
              <Text style={[styles.codeText, { color: colors.text }]}>
                {JSON.stringify(input, null, 2)}
              </Text>
            </Collapsible>
          </View>
        )}
        <View />
        {status === "init" && (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <Button
              color="primary"
              text="Continue"
              onPress={() => onConfirm(allowForSession)}
              testID="tool-continue-button"
            />
            <Button color="card" text="Cancel" onPress={onCancel} />
            <Checkbox
              value={allowForSession}
              onValueChange={setAllowForSession}
              testID="tool-allow-session-checkbox"
            >
              <Text style={{ color: colors.secondary }}>
                Allow tool for this session
              </Text>
            </Checkbox>
          </View>
        )}
      </View>
    );

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <TouchableOpacity
        onPress={() => setCollapsed((c) => !c)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Ionicons
          name={collapsed ? "chevron-forward-outline" : "chevron-down-outline"}
          size={20}
          style={{ marginRight: 4 }}
          color={colors.text}
        />
        <Text style={[styles.title, { flex: 1, color: colors.text }]}>
          {title}
        </Text>
        {status !== "loading" && (
          <Ionicons
            name={status === "success" ? "checkmark" : "close"}
            size={20}
            style={{ marginLeft: 4 }}
            color={status === "error" ? colors.error : colors.secondary}
          />
        )}
      </TouchableOpacity>

      {!collapsed && (
        <View style={{ paddingHorizontal: 24, paddingTop: 8, gap: 8 }}>
          <Text style={[styles.title, { color: colors.text }]}>Input</Text>
          <View style={styles.codeBlock}>
            <Text style={styles.codeText}>
              {JSON.stringify(input, null, 2)}
            </Text>
          </View>
          {status !== "loading" && (
            <>
              <Text style={[styles.title, { color: colors.text }]}>Output</Text>
              <View style={styles.codeBlock}>
                {status === "success" && (
                  <Text style={styles.codeText}>
                    {(() => {
                      try {
                        // Handle different output formats safely
                        if (Array.isArray(output)) {
                          // If it's an array of content objects, extract text content
                          const textContents = output
                            .filter((item: any) => item && typeof item === 'object' && item.type === 'text' && item.text)
                            .map((item: any) => item.text)
                            .join('\n\n');
                          return textContents || JSON.stringify(output, null, 2);
                        } else if (output && typeof output === 'object' && output.content) {
                          // If it has a content property (MCP tool result), extract and parse text content
                          if (Array.isArray(output.content)) {
                            const textContents = output.content
                              .filter((item: any) => item && typeof item === 'object' && item.type === 'text' && item.text)
                              .map((item: any) => {
                                const text = item.text;
                                // Try to parse JSON responses and format them nicely
                                try {
                                  const parsed = JSON.parse(text);
                                  if (parsed && typeof parsed === 'object') {
                                    // Format structured analysis responses
                                    if (parsed.success && parsed.analysisType) {
                                      return formatAnalysisResponse(parsed);
                                    }
                                    // Return nicely formatted JSON for other objects
                                    return JSON.stringify(parsed, null, 2);
                                  }
                                } catch (e) {
                                  // Not JSON, return as-is
                                }
                                return text;
                              })
                              .join('\n\n');
                            return textContents || JSON.stringify(output.content, null, 2);
                          } else {
                            return JSON.stringify(output.content, null, 2);
                          }
                        } else {
                          // For other objects, try to stringify but exclude problematic properties
                          const safeOutput = { ...output };
                          // Remove potentially problematic properties that might cause circular refs
                          delete safeOutput.workflowResult;
                          delete safeOutput.analysis;
                          return JSON.stringify(safeOutput, null, 2);
                        }
                      } catch (error) {
                        // If JSON stringify fails, try to extract text content manually
                        try {
                          if (output && typeof output === 'object' && output.content) {
                            if (Array.isArray(output.content)) {
                              const textContents = output.content
                                .filter((item: any) => item && typeof item === 'object' && item.type === 'text' && item.text)
                                .map((item: any) => item.text)
                                .join('\n\n');
                              return textContents;
                            }
                          }
                        } catch (innerError) {
                          // Fall back to string conversion
                        }
                        return String(output);
                      }
                    })()}
                  </Text>
                )}
                {status === "error" && (
                  <Text style={[styles.codeText, { color: colors.error }]}>
                    {(() => {
                      try {
                        return typeof output === 'string' ? output : JSON.stringify(output, null, 2);
                      } catch (error) {
                        return String(output);
                      }
                    })()}
                  </Text>
                )}
                {status === "cancelled" && (
                  <Text style={[styles.codeText, { color: colors.secondary }]}>
                    Tool call was cancelled by user.
                  </Text>
                )}
              </View>
            </>
          )}
        </View>
      )}
      {status === "loading" && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Spinner size={20} color="secondary" />
          <Text
            style={{ fontFamily: "Manrope_400Regular", color: colors.text }}
          >
            Running tool...
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 16,
    gap: 8,
  },
  title: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 14,
  },
  description: {
    fontFamily: "Manrope_400Regular",
    fontSize: 12,
  },
  codeBlock: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#0c0c0c33",
    width: "100%",
    maxHeight: 120,
    overflow: "scroll",
  },
  codeText: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#ffffff",
  },
  link: {
    fontFamily: "Manrope_500Medium",
    fontSize: 14,
    color: "#ffffff",
    textDecorationLine: "underline",
  },
});
