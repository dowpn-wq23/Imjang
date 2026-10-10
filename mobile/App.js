import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WEB_HTML from './generated/web';
import { createApi } from './generated/api-core';

// 서버 없이 동작: 지도 화면(public/)은 앱 안에 들어 있고, 공공 API·네이버 부동산은 앱이 직접 조회합니다.
// 네이버 지도는 등록된 Web 서비스 URL로 접속을 확인하므로, PC용으로 이미 등록한 주소를 화면 주소로 씁니다.
const BASE_URL = 'http://localhost:3000/';
const STORE_KEY = 'imjang:keys';
const DEFAULT_KEYS = { naverKeyId: '', vworldKey: '', vworldDomain: 'http://localhost:3000', dataGoKrKey: '', naverLand: true };

export default function App() {
  const [keys, setKeys] = useState(null); // null = 불러오는 중
  const [editing, setEditing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const webRef = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .catch(() => null)
      .then(saved => {
        let k = DEFAULT_KEYS;
        try { if (saved) k = { ...DEFAULT_KEYS, ...JSON.parse(saved) }; } catch { /* 기본값 */ }
        setKeys(k);
        if (!k.naverKeyId) setEditing(true);
      });
  }, []);

  const saveKeys = async k => {
    const clean = Object.fromEntries(Object.entries(k).map(([n, v]) => [n, typeof v === 'string' ? v.trim() : v]));
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(clean)).catch(() => {});
    setKeys(clean);
    setLoadError(null);
    setEditing(false);
    setReloadKey(n => n + 1);
  };

  const api = useMemo(() => keys && createApi({
    VWORLD_KEY: keys.vworldKey,
    VWORLD_DOMAIN: keys.vworldDomain || DEFAULT_KEYS.vworldDomain,
    DATA_GO_KR_KEY: keys.dataGoKrKey,
    NAVER_LAND_ENABLED: keys.naverLand,
  }), [keys]);

  // 서버의 /config.js 대신 키를 화면에 직접 끼워 넣음
  const html = useMemo(() => {
    if (!keys) return '';
    const cfg = JSON.stringify({ naverKeyId: keys.naverKeyId }).replace(/</g, '\\u003c');
    return WEB_HTML.replace('<!--APP_CONFIG-->', () => `<script>window.IMJANG_APP = true; window.APP_CONFIG = ${cfg};</script>`);
  }, [keys]);

  const sendToWeb = useCallback(msg => {
    webRef.current?.injectJavaScript(`window.__imjangNative && window.__imjangNative(${JSON.stringify(msg)}); true;`);
  }, []);

  const onMessage = useCallback(async e => {
    let msg;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg.type === 'settings') setEditing(true);
    if (msg.type === 'api') {
      const [status, body] = await api(msg.path);
      sendToWeb({ type: 'api-result', id: msg.id, status, body });
    }
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
  }, [api, sendToWeb]);

  // 앱 화면은 그대로, 토지이음·네이버부동산 같은 외부 링크는 사파리로
  const onShouldStart = req => {
    const u = req.url;
    if (!req.isTopFrame || u.startsWith(BASE_URL) || u.startsWith('about:') || u.startsWith('data:')) return true;
    Linking.openURL(u).catch(() => {});
    return false;
  };

  if (keys === null) return <Center><ActivityIndicator /></Center>;
  if (editing) return <Settings initial={keys} onSave={saveKeys} onCancel={keys.naverKeyId ? () => setEditing(false) : null} />;

  if (loadError) {
    return (
      <Center>
        <Text style={s.title}>지도를 불러오지 못했습니다</Text>
        <Text style={s.muted}>{loadError}</Text>
        <Text style={s.muted}>인터넷 연결을 확인하세요.</Text>
        <Button title="다시 시도" primary onPress={() => { setLoadError(null); setReloadKey(n => n + 1); }} />
        <Button title="API 키 설정" onPress={() => setEditing(true)} />
      </Center>
    );
  }

  return (
    <View style={s.fill}>
      <StatusBar style="light" />
      <WebView
        key={reloadKey}
        ref={webRef}
        style={s.fill}
        source={{ html, baseUrl: BASE_URL }}
        originWhitelist={['*']}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStart}
        onOpenWindow={e => Linking.openURL(e.nativeEvent.targetUrl).catch(() => {})}
        onError={e => setLoadError(e.nativeEvent.description)}
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

const FIELDS = [
  { key: 'naverKeyId', label: '네이버 지도 Client ID (필수)', help: '네이버 클라우드 플랫폼 → Maps → Application. Web 서비스 URL에 http://localhost:3000 이 등록돼 있어야 합니다.' },
  { key: 'vworldKey', label: 'VWorld 인증키', help: '공시지가·용도지역·필지 경계 (vworld.kr)' },
  { key: 'vworldDomain', label: 'VWorld 키에 등록한 서비스 URL', help: '보통 그대로 두면 됩니다.' },
  { key: 'dataGoKrKey', label: '공공데이터포털 일반 인증키 (Decoding)', help: '실거래가·건축물대장 (data.go.kr)' },
];

function Settings({ initial, onSave, onCancel }) {
  const [k, setK] = useState(initial);
  const set = (name, v) => setK(prev => ({ ...prev, [name]: v }));
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>API 키 설정</Text>
        <Text style={s.muted}>PC의 .env 파일에 넣었던 값을 그대로 붙여넣으세요. 키는 이 아이폰에만 저장됩니다.</Text>
        {FIELDS.map(f => (
          <View key={f.key} style={{ marginBottom: 14 }}>
            <Text style={s.label}>{f.label}</Text>
            <TextInput
              style={s.input}
              value={k[f.key]}
              onChangeText={v => set(f.key, v)}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              keyboardType={f.key === 'vworldDomain' ? 'url' : 'default'}
            />
            <Text style={s.help}>{f.help}</Text>
          </View>
        ))}
        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>네이버 부동산 매물 보기</Text>
            <Text style={s.help}>비공식 방식이라 네이버가 막을 수 있습니다.</Text>
          </View>
          <Switch value={k.naverLand} onValueChange={v => set('naverLand', v)} />
        </View>
        <Button title="저장" primary disabled={!k.naverKeyId.trim()} onPress={() => onSave(k)} />
        {onCancel ? <Button title="취소" onPress={onCancel} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
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
  form: { padding: 24, paddingTop: 64, paddingBottom: 48 },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 8, color: '#16181d' },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 6, color: '#16181d' },
  help: { fontSize: 12.5, color: '#6b7280', marginTop: 4, lineHeight: 18 },
  muted: { fontSize: 14, color: '#6b7280', marginBottom: 16, lineHeight: 20 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 12, fontSize: 16, color: '#16181d' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  btn: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 8 },
  btnPrimary: { backgroundColor: '#03c75a', borderColor: '#03c75a' },
  btnText: { fontSize: 15, fontWeight: '700', color: '#16181d' },
});
