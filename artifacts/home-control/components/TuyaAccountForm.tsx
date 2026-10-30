import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { TuyaSmartHome } from '@/services/tuyaSmartHome';

export function TuyaAccountForm({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const colors = useColors();
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [countryCode, setCountryCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeTarget, setCodeTarget] = useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const country = countryCode.trim().replace(/^\+/, '');
  const address = email.trim();
  const target = `${country}/${address.toLowerCase()}`;

  useEffect(() => {
    if (resendSeconds === 0) return;
    const timer = setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  const validate = () => {
    if (!/^\d{1,6}$/.test(country)) {
      setError('Enter the country calling code, for example 968 for Oman.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError('Enter a valid email address.');
      return false;
    }
    return true;
  };

  const sendCode = async () => {
    if (busy || resendSeconds > 0 || !validate()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await TuyaSmartHome.sendEmailCode(address, country);
      setCodeTarget(target);
      setResendSeconds(60);
      setNotice('Tuya sent a verification code. Check your inbox and spam folder.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not send a verification code.');
    } finally {
      setBusy(false);
    }
  };

  const authenticate = async () => {
    if (busy || !validate()) return;
    if (!password) {
      setError('Enter a password for your Home Control Tuya account.');
      return;
    }
    if (mode === 'register' && (codeTarget !== target || !code.trim())) {
      setError('Send a verification code to this email address, then enter it below.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'register') {
        await TuyaSmartHome.registerByEmail(country, address, password, code.trim());
        setMode('login');
        setCode('');
        setCodeTarget(null);
        setNotice('Account created. You can now sign in with this Home Control account.');
        if (!(await TuyaSmartHome.isLoggedIn())) {
          await TuyaSmartHome.loginByEmail(country, address, password);
        }
      } else {
        await TuyaSmartHome.loginByEmail(country, address, password);
      }
      setPassword('');
      Keyboard.dismiss();
      await onAuthenticated();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Tuya account sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = [styles.input, {
    backgroundColor: colors.background,
    borderColor: colors.border,
    color: colors.foreground,
  }];
  const action = (title: string, onPress: () => void, testID: string, disabled = false) => (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy || disabled }}
      testID={testID}
      style={[styles.action, { backgroundColor: colors.primary }, (busy || disabled) && styles.disabled]}
    >
      {busy ? <ActivityIndicator color={colors.primaryForeground} /> : (
        <Text style={[styles.actionText, { color: colors.primaryForeground }]}>{title}</Text>
      )}
    </Pressable>
  );

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: colors.foreground }]}>Home Control Tuya account</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        This app has a separate Tuya account system from Smart Life and from your
        Home Control app sign-in. Create an account here first; you can use the same
        email address. Existing Smart Life devices will not appear automatically.
        Your password goes directly to Tuya’s SDK and is not saved by Home Control.
      </Text>
      <View style={styles.tabs}>
        {(['register', 'login'] as const).map((value) => (
          <Pressable
            key={value}
            disabled={busy}
            onPress={() => { setMode(value); setError(null); setNotice(null); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === value, disabled: busy }}
            testID={`tuya-${value}-tab`}
            style={[styles.tab, { borderColor: colors.border, backgroundColor: mode === value ? colors.secondary : colors.background }]}
          >
            <Text style={[styles.actionText, { color: colors.foreground }]}>
              {value === 'register' ? 'Create account' : 'Sign in'}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput value={countryCode} onChangeText={setCountryCode} editable={!busy}
        placeholder="Country calling code, e.g. 968" placeholderTextColor={colors.mutedForeground}
        keyboardType="phone-pad" accessibilityLabel="Tuya account country code"
        testID="tuya-country-code-input" style={inputStyle} />
      <TextInput value={email} onChangeText={setEmail} editable={!busy}
        placeholder="Home Control Tuya account email" placeholderTextColor={colors.mutedForeground}
        keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress"
        accessibilityLabel="Tuya account email" testID="tuya-account-email-input" style={inputStyle} />
      <TextInput value={password} onChangeText={setPassword} editable={!busy}
        placeholder={mode === 'register' ? 'Choose an account password' : 'Home Control Tuya account password'}
        placeholderTextColor={colors.mutedForeground} secureTextEntry autoCapitalize="none" autoCorrect={false}
        textContentType={mode === 'register' ? 'newPassword' : 'password'}
        accessibilityLabel="Tuya account password" testID="tuya-account-password-input" style={inputStyle} />
      {mode === 'register' ? (
        <>
          {action(resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Send email verification code',
            sendCode, 'tuya-send-email-code-button', resendSeconds > 0)}
          <TextInput value={code} onChangeText={setCode} editable={!busy}
            placeholder="Email verification code" placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad" textContentType="oneTimeCode" autoCapitalize="none" autoCorrect={false}
            accessibilityLabel="Tuya email verification code" testID="tuya-email-code-input" style={inputStyle} />
        </>
      ) : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={[styles.body, { color: colors.mutedForeground }]}>{notice}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={[styles.body, { color: colors.destructive }]}>{error}</Text> : null}
      {action(mode === 'register' ? 'Create account and continue' : 'Sign in to Tuya',
        authenticate, mode === 'register' ? 'tuya-register-button' : 'tuya-login-button')}
      {mode === 'login' ? (
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          Only have a Smart Life account? Choose Create account above.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  title: { fontSize: 13, fontWeight: '700' },
  body: { fontSize: 11, lineHeight: 16 },
  input: { height: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontSize: 13 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  action: { minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  actionText: { fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
