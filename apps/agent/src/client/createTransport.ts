import * as Linking from "expo-linking";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { router } from "expo-router";
import { fetch } from "expo/fetch";
import { Platform } from "react-native";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { StreamableHTTPClientTransportWithTokenRetrieval } from "@/hooks/useMcpClientConnection";

import AsyncStorageOAuthClientProvider from "./AsyncStorageOAuthClientProvider";

export const clientUri =
  Platform.OS === "web"
    ? process.env.EXPO_PUBLIC_APP_URL
    : Constants.executionEnvironment === ExecutionEnvironment.StoreClient
      ? "exp://127.0.0.1:8081/--"
      : `${Constants.expoConfig?.scheme}://`;

const createTransport = (
  mcpUrl: string,
): StreamableHTTPClientTransportWithTokenRetrieval => {
  const authProvider = new AsyncStorageOAuthClientProvider(
    mcpUrl,
    clientUri + "/chat",
    {
      redirect_uris: [clientUri + "/chat"],
      client_name: "DKG Agent",
      client_uri: clientUri,
      logo_uri: process.env.EXPO_PUBLIC_APP_URL + "/logo.png",
      scope: "mcp llm blob",
    },
    async (url) => {
      if (Platform.OS !== "web") {
        url = await fetch(url.toString()).then((r) => new URL(r.url));

        if (url.origin === process.env.EXPO_PUBLIC_APP_URL) {
          console.log("Local redirect...", url.pathname + url.search);
          router.navigate({
            pathname: (url.pathname + url.search) as any,
          });
          return;
        }
      }

      console.log("Redirecting to a web URL...", url.toString());
      await Linking.openURL(url.toString());
    },
  );
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    fetch: (url, opts) =>
      globalThis.fetch(url.toString(), opts as RequestInit),
    authProvider,
  });
  return Object.assign(transport, {
    getToken: () => authProvider.tokens().then((t) => t?.access_token),
    logout: () => authProvider.logout(),
  });
};

export default createTransport;
