import { Asset } from "expo-asset";
import { Platform, View } from "react-native";
import { WebView } from "react-native-webview";

export default function Index() {
  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1 }}>
        <iframe src="/web/index.html" style={{ border: "none", width: "100%", height: "100%" }} />
      </View>
    );
  }

  // 📱 iOS/Android: ladda kopian under app/assets/web/
  const htmlModule = require("../../assets/web/index.html");
  const uri = Asset.fromModule(htmlModule).uri;

  return (
    <View style={{ flex: 1 }}>
      <WebView originWhitelist={["*"]} source={{ uri }} />
    </View>
  );
}
