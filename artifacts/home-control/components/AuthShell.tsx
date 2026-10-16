import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';

type AuthShellProps = PropsWithChildren<{
  title: string;
  subtitle: string;
}>;

export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  const colors = useColors();
  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
          <MaterialCommunityIcons
            name="home-variant"
            size={27}
            color={colors.primaryForeground}
          />
        </View>
        <Text style={[styles.brand, { color: colors.mutedForeground }]}>
          HOME CONTROL
        </Text>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {subtitle}
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {children}
        </View>
        <Text style={[styles.footnote, { color: colors.mutedForeground }]}>
          Your Tuya credentials stay on the secure server, not on this phone.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export const authStyles = StyleSheet.create({
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 7 },
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 13,
    fontSize: 14,
    marginBottom: 14,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButton: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonText: { fontSize: 14, fontWeight: '700' },
  actionText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  error: { fontSize: 12, lineHeight: 17, marginBottom: 12 },
  separator: { height: 1, marginVertical: 17 },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  brandMark: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  brand: { fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  title: { fontSize: 29, fontWeight: '700', letterSpacing: -0.7, marginTop: 5 },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 22 },
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 20,
  },
  footnote: {
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 17,
    paddingHorizontal: 12,
  },
});
