import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORE_KEY = 'imjang:serverUrl';

// 개발 중(Expo Go)에는 Expo를 실행한 PC의 IP를 그대로 써서 http://<PC IP>:3000 으로 접속
function devServerUrl() {
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:3000` : '';
}

const trimUrl = u => u.trim().replace(/\/+$/, '');

export default function App() {
  const [serverUrl, setServerUrl] = useState(null); // null = 불러오는 중
  const [editing, setEditing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const webRef = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .catch(() => null)
      .then(saved => {
        const url = saved || devServerUrl();
        setServerUrl(url);
        if (!url) setEditing(true);
      });
  }, []);

  const saveUrl = async url => {
    const clean = trimUrl(url);
    await AsyncStorage.setItem(STORE_KEY, clean).catch(() => {});
    setServerUrl(clean);
    setLoadError(null);
    setEditing(false);
  };

  const resetUrl = async () => {
    await AsyncStorage.removeItem(STORE_KEY).catch(() => {});
    const url = devServerUrl();
    setServerUrl(url);
    setLoadError(null);
    setEditing(!url);
  };

  const sendToWeb = useCallback(msg => {
    webRef.current?.injectJavaScript(`window.__imjangNative && window.__imjangNative(${JSON.stringify(msg)}); true;`);
  }, []);

  const onMessage = useCallback(async e => {
    let msg;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg.type === 'settings') setEditing(true);
    if (msg.type === 'locate') {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') throw new Error('위치 권한이 꺼져 있습니다. 설정 앱에서 허용해 주세요');
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        sendToWeb({ type: 'location', lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      } catch (err) {
        sendToWeb({ type: 'location-error', message: err.message });
      }
    }
  }, [sendToWeb]);

  // 우리 서버 화면은 앱 안에서, 토지이음·네이버부동산 같은 외부 링크는 사파리로
  const isOwnPage = url => serverUrl && url.startsWith(serverUrl);
  const onShouldStart = req => {
    if (!req.isTopFrame || isOwnPage(req.url) || req.url.startsWith('about:')) return true;
    Linking.openURL(req.url).catch(() => {});
    return false;
  };

  if (serverUrl === null) return <Center><ActivityIndicator /></Center>;
  if (editing) return <Settings initial={serverUrl || devServerUrl()} onSave={saveUrl} onReset={resetUrl} onCancel={serverUrl ? () => setEditing(false) : null} />;

  if (loadError) {
    return (
      <Center>
        <Text style={s.title}>서버에 연결할 수 없습니다</Text>
        <Text style={s.body}>{serverUrl}</Text>
        <Text style={s.muted}>{loadError}</Text>
        <Text style={s.muted}>PC에서 서버가 켜져 있는지, 아이폰과 PC가 같은 와이파이인지 확인하세요.</Text>
        <Button title="다시 시도" primary onPress={() => setLoadError(null)} />
        <Button title="서버 주소 바꾸기" onPress={() => setEditing(true)} />
      </Center>
    );
  }

  return (
    <View style={s.fill}>
      <StatusBar style="light" />
      <WebView
        ref={webRef}
        style={s.fill}
        source={{ uri: serverUrl }}
        originWhitelist={['*']}
        injectedJavaScriptBeforeContentLoaded="window.IMJANG_APP = true; true;"
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStart}
        onOpenWindow={e => Linking.openURL(e.nativeEvent.targetUrl).catch(() => {})}
        onError={e => setLoadError(e.nativeEvent.description)}
        onHttpError={e => { if (isOwnPage(e.nativeEvent.url)) setLoadError(`HTTP ${e.nativeEvent.statusCode}`); }}
        startInLoadingState
        renderLoading={() => <Center style={StyleSheet.absoluteFill}><ActivityIndicator /></Center>}
        allowsInlineMediaPlayback
        bounces={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        setSupportMultipleWindows
      />
    </View>
  );
}

function Settings({ initial, onSave, onReset, onCancel }) {
  const [url, setUrl] = useState(initial);
  return (
    <Center>
      <StatusBar style="auto" />
      <Text style={s.title}>서버 주소</Text>
      <Text style={s.muted}>
        PC에서 테스트할 때: http://PC의IP:3000{'\n'}
        클라우드에 올린 뒤: https://내주소.onrender.com
      </Text>
      <TextInput
        style={s.input}
        value={url}
        onChangeText={setUrl}
        placeholder="http://192.168.0.10:3000"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="done"
        onSubmitEditing={() => url.trim() && onSave(url)}
      />
      <Button title="저장" primary disabled={!url.trim()} onPress={() => onSave(url)} />
      {devServerUrl() ? <Button title={`PC 자동 주소 사용 (${devServerUrl()})`} onPress={onReset} /> : null}
      {onCancel ? <Button title="취소" onPress={onCancel} /> : null}
    </Center>
  );
}

const Center = ({ children, style }) => <View style={[s.center, style]}>{children}</View>;

const Button = ({ title, onPress, primary, disabled }) => (
  <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.btn, primary && s.btnPrimary, (pressed || disabled) && { opacity: 0.6 }]}>
    <Text style={[s.btnText, primary && { color: '#fff' }]}>{title}</Text>
  </Pressable>
);

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'stretch', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 8, color: '#16181d' },
  body: { fontSize: 15, marginBottom: 6, color: '#16181d' },
  muted: { fontSize: 14, color: '#6b7280', marginBottom: 12, lineHeight: 20 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 12, color: '#16181d' },
  btn: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 8 },
  btnPrimary: { backgroundColor: '#03c75a', borderColor: '#03c75a' },
  btnText: { fontSize: 15, fontWeight: '700', color: '#16181d' },
});
