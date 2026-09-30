/**
 * Image Picker - Native Implementation
 * Uses expo-image-picker for iOS/Android
 */

import * as ImagePicker from 'expo-image-picker'

export interface ImagePickerResult {
  uri: string
  base64?: string
  width?: number
  height?: number
  fileSize?: number
  duration?: number
}

export const pickImage = async (options: {
  allowsEditing?: boolean
  quality?: number
  base64?: boolean
}): Promise<ImagePickerResult | null> => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()

  if (status !== 'granted') {
    throw new Error('Permission refusée')
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: options.allowsEditing ?? true,
    quality: options.quality ?? 0.8,
    base64: options.base64 ?? false,
  })

  if (result.canceled || !result.assets[0]) {
    return null
  }

  const asset = result.assets[0]
  return {
    uri: asset.uri,
    base64: asset.base64 ?? undefined,
    width: asset.width,
    height: asset.height,
    fileSize: asset.fileSize ?? undefined,
  }
}

export const pickVideo = async (options: {
  maxDuration?: number
  quality?: number
}): Promise<ImagePickerResult | null> => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()

  if (status !== 'granted') {
    throw new Error('Permission refusée')
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    allowsEditing: true,
    quality: options.quality ?? 0.8,
    videoMaxDuration: options.maxDuration ?? 120,
  })

  if (result.canceled || !result.assets[0]) {
    return null
  }

  const asset = result.assets[0]
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    fileSize: asset.fileSize ?? undefined,
    duration: asset.duration ?? undefined,
  }
}

export const takePhoto = async (options: {
  allowsEditing?: boolean
  quality?: number
  base64?: boolean
}): Promise<ImagePickerResult | null> => {
  const { status } = await ImagePicker.requestCameraPermissionsAsync()

  if (status !== 'granted') {
    throw new Error('Permission refusée')
  }

  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: options.allowsEditing ?? true,
    quality: options.quality ?? 0.8,
    base64: options.base64 ?? false,
  })

  if (result.canceled || !result.assets[0]) {
    return null
  }

  const asset = result.assets[0]
  return {
    uri: asset.uri,
    base64: asset.base64 ?? undefined,
    width: asset.width,
    height: asset.height,
    fileSize: asset.fileSize ?? undefined,
  }
}
