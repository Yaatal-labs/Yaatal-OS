/**
 * Add Product Screen (Merchant)
 * Create new product with photo
 */

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useAuthStore } from '../../store/authStore'
import { productsService } from '@njooba/core'
import { colors, typography, spacing } from '../../theme'
import type { Product, ProductFormData } from '../../types/models'

const CATEGORIES = [
  { value: 'fashion', label: 'Mode 👔' },
  { value: 'electronics', label: 'Électronique 📱' },
  { value: 'beauty', label: 'Beauté 💄' },
  { value: 'food', label: 'Alimentation 🍽️' },
  { value: 'home', label: 'Maison 🏠' },
  { value: 'other', label: 'Autre 📦' },
]

export const AddProductScreen = ({ route, navigation }: any) => {
  const { profile } = useAuthStore()
  const productId = route?.params?.productId as string | undefined
  const isEditMode = !!productId
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState<ProductFormData>({
    title: '',
    description: '',
    price: 0,
    category: 'other',
    stock_quantity: 1,
  })
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [videoUri, setVideoUri] = useState<string | null>(null)
  const [videoDuration, setVideoDuration] = useState<number>(0)

  useEffect(() => {
    if (!productId) return

    let cancelled = false

    const loadProduct = async () => {
      setIsLoading(true)
      const product = (await productsService.getById(productId)) as Product | undefined

      if (cancelled) return

      if (!product) {
        setIsLoading(false)
        Alert.alert('Erreur', 'Produit introuvable', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ])
        return
      }

      setFormData({
        title: product.title,
        description: product.description || '',
        price: product.price,
        discount_price: product.discount_price,
        category: product.category,
        stock_quantity: product.stock_quantity,
      })
      setImageUri(product.image_url || null)
      setVideoUri(product.video_url || null)
      setVideoDuration(0)
      setIsLoading(false)
    }

    loadProduct()

    return () => {
      cancelled = true
    }
  }, [productId, navigation])

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()

    if (status !== 'granted') {
      Alert.alert('Permission requise', 'Nous avons besoin d\'accéder à vos photos')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri)
    }
  }

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()

    if (status !== 'granted') {
      Alert.alert('Permission requise', 'Nous avons besoin d\'accéder à vos vidéos')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      quality: 0.8,
      videoMaxDuration: 120, // 2 minutes max
    })

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0]

      // Check file size (50MB max)
      if (asset.fileSize && asset.fileSize > 50 * 1024 * 1024) {
        Alert.alert('Erreur', 'La vidéo ne peut pas dépasser 50MB')
        return
      }

      // Check duration (2 minutes max)
      if (asset.duration && asset.duration > 120) {
        Alert.alert('Erreur', 'La vidéo ne peut pas dépasser 2 minutes')
        return
      }

      setVideoUri(asset.uri)
      setVideoDuration(asset.duration || 0)
    }
  }

  const handleSubmit = async () => {
    if (!profile) return

    if (!imageUri) {
      Alert.alert('Erreur', 'Veuillez ajouter une photo du produit')
      return
    }

    if (!formData.title.trim()) {
      Alert.alert('Erreur', 'Le titre est requis')
      return
    }

    if (formData.price <= 0) {
      Alert.alert('Erreur', 'Le prix doit être supérieur à 0')
      return
    }

    setIsLoading(true)

    const payload = {
      ...formData,
      image_uri: imageUri,
      video_uri: videoUri || undefined,
    }
    const result = isEditMode
      ? await productsService.update(productId!, payload)
      : await productsService.create(profile.id, payload)

    setIsLoading(false)

    if (result.success) {
      Alert.alert('Succès', isEditMode ? 'Produit mis à jour avec succès!' : 'Produit créé avec succès!', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ])
    } else {
      Alert.alert('Erreur', result.error || 'Échec de la création')
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Image Picker */}
        <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.image} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.imagePlaceholderIcon}>📷</Text>
              <Text style={styles.imagePlaceholderText}>
                Ajouter une photo
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Video Picker (Optional) */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Vidéo du produit (optionnel)</Text>
          <Text style={styles.hint}>
            Max 50MB, 2 minutes - Comme Taobao
          </Text>
          <TouchableOpacity
            style={styles.videoPicker}
            onPress={pickVideo}
          >
            {videoUri ? (
              <View style={styles.videoSelected}>
                <Text style={styles.videoIcon}>🎥</Text>
                <Text style={styles.videoInfo}>
                  Vidéo sélectionnée ({Math.round(videoDuration)}s)
                </Text>
                <TouchableOpacity
                  onPress={() => setVideoUri(null)}
                  style={styles.removeVideo}
                >
                  <Text style={styles.removeVideoText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.videoPlaceholder}>
                <Text style={styles.videoIcon}>🎥</Text>
                <Text style={styles.videoPlaceholderText}>
                  Ajouter une vidéo de démo
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Title */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Titre du produit *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: Robe Africaine Wax"
            placeholderTextColor={colors.text.tertiary}
            value={formData.title}
            onChangeText={(title) => setFormData({ ...formData, title })}
          />
        </View>

        {/* Description */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Décrivez votre produit..."
            placeholderTextColor={colors.text.tertiary}
            value={formData.description}
            onChangeText={(description) =>
              setFormData({ ...formData, description })
            }
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Price */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Prix (CFA) *</Text>
          <TextInput
            style={styles.input}
            placeholder="10000"
            placeholderTextColor={colors.text.tertiary}
            value={formData.price > 0 ? formData.price.toString() : ''}
            onChangeText={(text) =>
              setFormData({ ...formData, price: parseInt(text) || 0 })
            }
            keyboardType="numeric"
          />
        </View>

        {/* Category */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Catégorie *</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.value}
                style={[
                  styles.categoryButton,
                  formData.category === cat.value &&
                    styles.categoryButtonActive,
                ]}
                onPress={() =>
                  setFormData({ ...formData, category: cat.value as any })
                }
              >
                <Text
                  style={[
                    styles.categoryButtonText,
                    formData.category === cat.value &&
                      styles.categoryButtonTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Stock */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Quantité en stock *</Text>
          <TextInput
            style={styles.input}
            placeholder="1"
            placeholderTextColor={colors.text.tertiary}
            value={formData.stock_quantity.toString()}
            onChangeText={(text) =>
              setFormData({
                ...formData,
                stock_quantity: parseInt(text) || 0,
              })
            }
            keyboardType="numeric"
          />
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.text.inverse} />
          ) : (
            <Text style={styles.submitButtonText}>
              {isEditMode ? 'Mettre à jour le produit' : 'Créer le produit'}
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.main,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.xl,
  },
  imagePicker: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    flex: 1,
    backgroundColor: colors.background.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border.light,
    borderStyle: 'dashed',
  },
  imagePlaceholderIcon: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  imagePlaceholderText: {
    ...typography.body,
    color: colors.text.secondary,
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
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryButton: {
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  categoryButtonActive: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
  },
  categoryButtonText: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  categoryButtonTextActive: {
    ...typography.captionBold,
    color: colors.primary,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: spacing.base,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    ...typography.button,
    color: colors.text.inverse,
  },
  hint: {
    ...typography.micro,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  videoPicker: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  videoSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '20',
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 12,
    padding: spacing.md,
  },
  videoPlaceholder: {
    backgroundColor: colors.background.surface,
    borderWidth: 2,
    borderColor: colors.border.light,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: spacing.lg,
    alignItems: 'center',
  },
  videoIcon: {
    fontSize: 32,
    marginRight: spacing.sm,
  },
  videoInfo: {
    ...typography.body,
    color: colors.primary,
    flex: 1,
  },
  videoPlaceholderText: {
    ...typography.body,
    color: colors.text.secondary,
  },
  removeVideo: {
    padding: spacing.xs,
  },
  removeVideoText: {
    ...typography.h3,
    color: colors.error,
  },
  bottomSpacing: {
    height: spacing['3xl'],
  },
})

