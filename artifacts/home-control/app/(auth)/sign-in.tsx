import { useSignIn } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { AuthShell, authStyles } from '@/components/AuthShell';
import { useColors } from '@/hooks/useColors';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';

function describeError(error: unknown) {
  if (!error || typeof error !== 'object') return 'Could not sign in. Try again.';
  const value = error as {
    message?: string;
    errors?: Array<{ longMessage?: string; message?: string }>;
  };
  return value.errors?.[0]?.longMessage || value.errors?.[0]?.message || value.message || 'Could not sign in. Try again.';
}

export default function SignInScreen() {
  const colors = useColors();
  const router = useRouter();
  const { signIn, errors, fetchStatus } = useSignIn();
  const google = useGoogleAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finishSignIn = async () => {
    await signIn.finalize({
      navigate: () => router.replace('/(tabs)'),
    });
  };

  const submitPassword = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await signIn.password({
        emailAddress: email.trim(),
        password,
      });
      if (result.error) {
        setMessage(describeError(result.error));
      } else if (signIn.status === 'complete') {
        await finishSignIn();
      } else if (signIn.status === 'needs_client_trust') {
        const emailFactor = signIn.supportedSecondFactors.find(
          (factor) => factor.strategy === 'email_code',
        );
        if (emailFactor) await signIn.mfa.sendEmailCode();
        else setMessage('Complete the additional verification in Clerk settings.');
      } else if (signIn.status === 'needs_second_factor') {
        setMessage('This account requires another verification method that is not set up in this app.');
      }
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  const verifyEmailCode = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await signIn.mfa.verifyEmailCode({ code: code.trim() });
      if (result.error) {
        setMessage(describeError(result.error));
      } else if (signIn.status === 'complete') {
        await finishSignIn();
      }
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  const isVerifying = signIn.status === 'needs_client_trust';
  const loading = busy || fetchStatus === 'fetching' || google.loading;

  return (
    <AuthShell
      title={isVerifying ? 'Verify your sign-in' : 'Welcome home'}
      subtitle={
        isVerifying
          ? 'Enter the code we sent to your email.'
          : 'Sign in to view your rooms and device tiles.'
      }
    >
      {isVerifying ? (
        <>
          <Text style={[authStyles.fieldLabel, { color: colors.foreground }]}>
            Email verification code
          </Text>
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
            onPress={() => void verifyEmailCode()}
            disabled={loading || !code.trim()}
            style={[authStyles.primaryButton, { backgroundColor: colors.primary, opacity: loading ? 0.65 : 1 }]}
          >
            <Text style={[authStyles.buttonText, { color: colors.primaryForeground }]}>
              Verify and continue
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void signIn.mfa.sendEmailCode()}
            style={{ paddingVertical: 13 }}
          >
            <Text style={[authStyles.actionText, { color: colors.primary }]}>Send a new code</Text>
          </Pressable>
          <Pressable onPress={() => signIn.reset()} style={{ paddingVertical: 6 }}>
            <Text style={[authStyles.actionText, { color: colors.mutedForeground }]}>Start over</Text>
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
            autoComplete="current-password"
            textContentType="password"
            secureTextEntry
            accessibilityLabel="Password"
            placeholder="Enter your password"
            placeholderTextColor={colors.mutedForeground}
            style={[
              authStyles.field,
              { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
            ]}
          />
          <Pressable
            onPress={() => void submitPassword()}
            disabled={loading || !email.trim() || !password}
            style={[authStyles.primaryButton, { backgroundColor: colors.primary, opacity: loading ? 0.65 : 1 }]}
          >
            <Text style={[authStyles.buttonText, { color: colors.primaryForeground }]}>
              {loading ? 'Signing in…' : 'Sign in'}
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
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>New to Home Control? </Text>
            <Link href="/(auth)/sign-up" asChild>
              <Pressable>
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>Create account</Text>
              </Pressable>
            </Link>
          </View>
        </>
      )}
      {(message || google.error || errors.fields.identifier?.message || errors.fields.password?.message || errors.fields.code?.message) && (
        <Text style={[authStyles.error, { color: colors.destructive, marginTop: 12 }]}>
          {message || google.error || errors.fields.identifier?.message || errors.fields.password?.message || errors.fields.code?.message}
        </Text>
      )}
    </AuthShell>
  );
}
