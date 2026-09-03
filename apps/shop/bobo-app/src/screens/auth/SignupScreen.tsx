/**
 * Signup Screen
 * User registration with merchant/customer selection
 */

import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useAuthStore } from '../../store/authStore'
import { colors, typography, spacing } from '../../theme'
import type { SignupFormData } from '@yaatal/core'

export const SignupScreen = ({ navigation }: any) => {
  const { signUp, isLoading, error, clearError } = useAuthStore()
  const [formData, setFormData] = useState<SignupFormData>({
    email: '',
    password: '',
    passwordConfirm: '',
    username: '',
    isMerchant: false,
  })

  const handleSignup = async () => {
    clearError()
    const success = await signUp(formData)

    if (!success) {
      const latestError = useAuthStore.getState().error
      Alert.alert('Erreur', latestError || 'Erreur lors de l\'inscription')
    }
    // Success handled by navigation
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Créer un compte</Text>
        </View>

        {/* Account Type Selection */}
        <View style={styles.accountTypeContainer}>
          <Text style={styles.sectionLabel}>Je suis...</Text>
          <View style={styles.accountTypeButtons}>
            <TouchableOpacity
              style={[
                styles.accountTypeButton,
                !formData.isMerchant && styles.accountTypeButtonActive,
              ]}
              onPress={() => setFormData({ ...formData, isMerchant: false })}
            >
              <Text
                style={[
                  styles.accountTypeText,
                  !formData.isMerchant && styles.accountTypeTextActive,
                ]}
              >
                🛍️ Client
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.accountTypeButton,
                formData.isMerchant && styles.accountTypeButtonActive,
              ]}
              onPress={() => setFormData({ ...formData, isMerchant: true })}
            >
              <Text
                style={[
                  styles.accountTypeText,
                  formData.isMerchant && styles.accountTypeTextActive,
                ]}
              >
                🏪 Vendeur
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Username */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nom d'utilisateur</Text>
            <TextInput
              style={styles.input}
              placeholder="votreusername"
              placeholderTextColor={colors.text.tertiary}
              value={formData.username}
              onChangeText={(username) => setFormData({ ...formData, username })}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="votre@email.com"
              placeholderTextColor={colors.text.tertiary}
              value={formData.email}
              onChangeText={(email) => setFormData({ ...formData, email })}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Mot de passe</Text>
            <TextInput
              style={styles.input}
              placeholder="Min. 12 caractères"
              placeholderTextColor={colors.text.tertiary}
              value={formData.password}
              onChangeText={(password) => setFormData({ ...formData, password })}
              secureTextEntry
            />
            <Text style={styles.hint}>
              Doit contenir: majuscule, minuscule, chiffre, caractère spécial
            </Text>
          </View>

          {/* Confirm Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirmer le mot de passe</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••••••"
              placeholderTextColor={colors.text.tertiary}
              value={formData.passwordConfirm}
              onChangeText={(passwordConfirm) =>
                setFormData({ ...formData, passwordConfirm })
              }
              secureTextEntry
            />
          </View>

          {/* Signup Button */}
          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.text.inverse} />
            ) : (
              <Text style={styles.buttonText}>Créer mon compte</Text>
            )}
          </TouchableOpacity>

          {/* Login Link */}
          <TouchableOpacity
            style={styles.loginLink}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.loginLinkText}>
              Déjà un compte ?{' '}
              <Text style={styles.loginLinkTextBold}>Connectez-vous</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.main,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.xl,
  },
  header: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  backButton: {
    marginBottom: spacing.md,
  },
  backButtonText: {
    ...typography.body,
    color: colors.primary,
  },
  title: {
    ...typography.h1,
    color: colors.text.primary,
  },
  accountTypeContainer: {
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    ...typography.captionBold,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  accountTypeButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  accountTypeButton: {
    flex: 1,
    backgroundColor: colors.background.surface,
    borderWidth: 2,
    borderColor: colors.border.light,
    borderRadius: 12,
    padding: spacing.base,
    alignItems: 'center',
  },
  accountTypeButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  accountTypeText: {
    ...typography.bodyBold,
    color: colors.text.secondary,
  },
  accountTypeTextActive: {
    color: colors.primary,
  },
  form: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.captionBold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  input: {
    ...typography.body,
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: 12,
    padding: spacing.base,
    color: colors.text.primary,
  },
  hint: {
    ...typography.micro,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: spacing.base,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...typography.button,
    color: colors.text.inverse,
  },
  loginLink: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  loginLinkText: {
    ...typography.body,
    color: colors.text.secondary,
  },
  loginLinkTextBold: {
    ...typography.bodyBold,
    color: colors.primary,
  },
})
