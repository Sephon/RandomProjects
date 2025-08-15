// App.tsx
import { useRef } from 'react';
import { Button, View } from 'react-native';
import { WebView } from 'react-native-webview';

export default function App() {
  const ref = useRef<WebView>(null);
  return (
    <View style={{ flex: 1 }}>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={require('./assets/web/index.html')}
        onMessage={(e) => {
          // messages from web: e.nativeEvent.data (string)
        }}
        // optional: inject JS into the web page at load
        injectedJavaScript={`window.ReactNativeReady = true; true;`}
      />
      <Button
        title="Start from RN"
        onPress={() => ref.current?.postMessage(JSON.stringify({ cmd: 'start' }))}
      />
    </View>
  );
}
