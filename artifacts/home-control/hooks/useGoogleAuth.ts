import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useSSO } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

export function useGoogleAuth() {
  const { startSSOFlow } = useSSO();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  const signInWithGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      const redirectOptions =
        Platform.OS === 'web'
          ? {}
          : {
              redirectUrl: AuthSession.makeRedirectUri({
                scheme: 'home-control',
              }),
            };
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
        ...redirectOptions,
      });
      if (!createdSessionId) {
        setError('Complete any requested verification, then try again.');
        return;
      }
      await setActive!({
        session: createdSessionId,
        navigate: () => router.replace('/(tabs)'),
      });
    } catch (error) {
      const details =
        error && typeof error === 'object'
          ? (error as {
              message?: string;
              status?: number;
              errors?: Array<{
                code?: string;
                longMessage?: string;
                message?: string;
              }>;
            })
          : {};
      const firstError = details.errors?.[0];
      const rawMessage =
        firstError?.longMessage ?? firstError?.message ?? details.message;
      const safeMessage =
        typeof rawMessage === 'string'
          ? rawMessage.replace(/https?:\/\/\S+/g, '[link]').slice(0, 180)
          : undefined;

      console.error('Google OAuth failed', {
        code: firstError?.code,
        status: details.status,
        message: safeMessage,
      });
      setError(
        __DEV__ && safeMessage
          ? `Google sign-in failed: ${safeMessage}`
          : 'Google sign-in is unavailable right now. Try email and password.',
      );
    } finally {
      setLoading(false);
    }
  };

  return { signInWithGoogle, loading, error, clearError: () => setError(null) };
}
