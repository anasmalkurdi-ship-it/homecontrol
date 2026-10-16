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
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri({ scheme: 'home-control' }),
      });
      if (!createdSessionId) {
        setError('Complete any requested verification, then try again.');
        return;
      }
      await setActive!({
        session: createdSessionId,
        navigate: () => router.replace('/(tabs)'),
      });
    } catch {
      setError('Google sign-in is unavailable right now. Try email and password.');
    } finally {
      setLoading(false);
    }
  };

  return { signInWithGoogle, loading, error, clearError: () => setError(null) };
}
