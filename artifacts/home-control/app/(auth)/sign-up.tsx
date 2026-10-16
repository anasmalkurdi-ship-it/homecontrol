import { useSignUp } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { AuthShell, authStyles } from '@/components/AuthShell';
import { useColors } from '@/hooks/useColors';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';

function describeError(error: unknown) {
  if (!error || typeof error !== 'object') return 'Could not create the account. Try again.';
  const value = error as {
    message?: string;
    errors?: Array<{ longMessage?: string; message?: string }>;
  };
  return value.errors?.[0]?.longMessage || value.errors?.[0]?.message || value.message || 'Could not create the account. Try again.';
}

export default function SignUpScreen() {
  const colors = useColors();
  const router = useRouter();
  const { signUp, errors, fetchStatus } = useSignUp();
  const google = useGoogleAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finishSignUp = async () => {
    await signUp.finalize({
      navigate: () => router.replace('/(tabs)'),
    });
  };

  const submitSignUp = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await signUp.password({
        emailAddress: email.trim(),
        password,
      });
      if (result.error) {
        setMessage(describeError(result.error));
        return;
      }
      await signUp.verifications.sendEmailCode();
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  const verifyEmail = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (result.error) {
        setMessage(describeError(result.error));
      } else if (signUp.status === 'complete') {
        await finishSignUp();
      }
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  const needsEmailCode =
    signUp.status === 'missing_requirements' &&
    signUp.unverifiedFields.includes('email_address') &&
    signUp.missingFields.length === 0;
  const loading = busy || fetchStatus === 'fetching' || google.loading;

  return (
    <AuthShell
      title={needsEmailCode ? 'Check your email' : 'Create your account'}
      subtitle={
        needsEmailCode
          ? 'Enter the verification code to finish setting up your account.'
          : 'Create a secure account to access your home controls.'
      }
    >
      {needsEmailCode ? (
        <>
          <Text style={[authStyles.fieldLabel, { color: colors.foreground }]}>Verification code</Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            accessibilityLabel="Email verification code"
            placeholder="Enter your code"
            placeholderTextColor={colors.mutedForeground}
            style={[
              authStyles.field,
              { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
            ]}
          />
          <Pressable
            onPress={() => void verifyEmail()}
            disabled={loading || !code.trim()}
            style={[authStyles.primaryButton, { backgroundColor: colors.primary, opacity: loading ? 0.65 : 1 }]}
          >
            <Text style={[authStyles.buttonText, { color: colors.primaryForeground }]}>
              Verify email
            </Text>
          </Pressable>
          <Pressable onPress={() => void signUp.verifications.sendEmailCode()} style={{ paddingVertical: 13 }}>
            <Text style={[authStyles.actionText, { color: colors.primary }]}>Send a new code</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={[authStyles.fieldLabel, { color: colors.foreground }]}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            accessibilityLabel="Email address"
            placeholder="you@example.com"
            placeholderTextColor={colors.mutedForeground}
            style={[
              authStyles.field,
              { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
            ]}
          />
          <Text style={[authStyles.fieldLabel, { color: colors.foreground }]}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            secureTextEntry
            accessibilityLabel="Password"
            placeholder="Create a password"
            placeholderTextColor={colors.mutedForeground}
            style={[
              authStyles.field,
              { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
            ]}
          />
          <Pressable
            onPress={() => void submitSignUp()}
            disabled={loading || !email.trim() || password.length < 8}
            style={[authStyles.primaryButton, { backgroundColor: colors.primary, opacity: loading ? 0.65 : 1 }]}
          >
            <Text style={[authStyles.buttonText, { color: colors.primaryForeground }]}>
              {loading ? 'Creating account…' : 'Create account'}
            </Text>
          </Pressable>
          <View style={[authStyles.separator, { backgroundColor: colors.border }]} />
          <Pressable
            onPress={() => void google.signInWithGoogle()}
            disabled={loading}
            style={[
              authStyles.secondaryButton,
              { borderColor: colors.border, backgroundColor: colors.background, opacity: loading ? 0.65 : 1 },
            ]}
          >
            <Text style={[authStyles.buttonText, { color: colors.foreground }]}>
              Continue with Google
            </Text>
          </Pressable>
          <View style={{ marginTop: 17, flexDirection: 'row', justifyContent: 'center' }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Already have an account? </Text>
            <Link href="/(auth)/sign-in" asChild>
              <Pressable>
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>Sign in</Text>
              </Pressable>
            </Link>
          </View>
          <View nativeID="clerk-captcha" />
        </>
      )}
      {(message || google.error || errors.fields.emailAddress?.message || errors.fields.password?.message || errors.fields.code?.message) && (
        <Text style={[authStyles.error, { color: colors.destructive, marginTop: 12 }]}>
          {message || google.error || errors.fields.emailAddress?.message || errors.fields.password?.message || errors.fields.code?.message}
        </Text>
      )}
    </AuthShell>
  );
}
