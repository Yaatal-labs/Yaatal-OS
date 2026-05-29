/**
 * QR Scanner Screen (Customer)
 * Scan QR codes from merchant livestreams to view products
 */

import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Linking,
} from 'react-native'
import { CameraView, Camera, BarcodeScanningResult } from 'expo-camera'
import { parseBoboProductLink } from '@njooba/core'
import { colors, typography, spacing } from '../../theme'

export const QRScannerScreen = ({ navigation }: any) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [scanned, setScanned] = useState(false)
  const [isScanning, setIsScanning] = useState(true)

  useEffect(() => {
    requestCameraPermission()
  }, [])

  const requestCameraPermission = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync()
    setHasPermission(status === 'granted')

    if (status !== 'granted') {
      Alert.alert(
        'Permission requise',
        'BOBO a besoin d\'accéder à votre caméra pour scanner les QR codes',
        [
          { text: 'Annuler', style: 'cancel', onPress: () => navigation.goBack() },
          { text: 'Paramètres', onPress: () => Linking.openSettings() },
        ]
      )
    }
  }

  const handleBarCodeScanned = ({ type, data }: BarcodeScanningResult) => {
    if (!isScanning || scanned) return

    setScanned(true)
    setIsScanning(false)

    const deepLink = parseBoboProductLink(data)

    if (deepLink) {
      navigation.navigate('ProductDetail', { productId: deepLink.productId })
      return
    }

    Alert.alert(
      'QR Code invalide',
      'Ce QR code ne correspond pas à un produit BOBO',
      [
        {
          text: 'Réessayer',
          onPress: () => {
            setScanned(false)
            setIsScanning(true)
          },
        },
        { text: 'Annuler', onPress: () => navigation.goBack() },
      ]
    )
  }

  const handleRescan = () => {
    setScanned(false)
    setIsScanning(true)
  }

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Demande d'accès à la caméra...</Text>
      </View>
    )
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorIcon}>📷</Text>
        <Text style={styles.errorTitle}>Caméra non autorisée</Text>
        <Text style={styles.errorMessage}>
          Veuillez autoriser l'accès à la caméra dans les paramètres pour scanner les QR codes
        </Text>
        <TouchableOpacity style={styles.settingsButton} onPress={() => Linking.openSettings()}>
          <Text style={styles.settingsButtonText}>Ouvrir les paramètres</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={isScanning ? handleBarCodeScanned : undefined}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
      >
        <View style={styles.overlay}>
          {/* Top Instructions */}
          <View style={styles.topSection}>
            <View style={styles.instructionsBox}>
              <Text style={styles.instructionsIcon}>📱</Text>
              <Text style={styles.instructionsTitle}>Scanner un QR Code</Text>
              <Text style={styles.instructionsText}>
                Positionnez le QR code dans le cadre
              </Text>
              <Text style={styles.instructionsSubtext}>
                Scannez depuis TikTok, Instagram ou WhatsApp
              </Text>
            </View>
          </View>

          {/* Scanning Frame */}
          <View style={styles.middleSection}>
            <View style={styles.scanFrame}>
              {/* Corner Markers */}
              <View style={[styles.corner, styles.cornerTopLeft]} />
              <View style={[styles.corner, styles.cornerTopRight]} />
              <View style={[styles.corner, styles.cornerBottomLeft]} />
              <View style={[styles.corner, styles.cornerBottomRight]} />

              {/* Scanning Line Animation */}
              {isScanning && (
                <View style={styles.scanningIndicator}>
                  <Text style={styles.scanningText}>🔍 Recherche...</Text>
                </View>
              )}

              {scanned && (
                <View style={styles.scannedIndicator}>
                  <Text style={styles.scannedText}>✅ Scanné!</Text>
                </View>
              )}
            </View>
          </View>

          {/* Bottom Actions */}
          <View style={styles.bottomSection}>
            {scanned && (
              <TouchableOpacity style={styles.rescanButton} onPress={handleRescan}>
                <Text style={styles.rescanButtonText}>🔄 Scanner à nouveau</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.cancelButtonText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </CameraView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.dark,
  },
  message: {
    ...typography.body,
    color: colors.text.inverse,
    textAlign: 'center',
  },
  errorIcon: {
    fontSize: 64,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  errorTitle: {
    ...typography.h1,
    color: colors.text.inverse,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  errorMessage: {
    ...typography.body,
    color: colors.text.tertiary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  settingsButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.xl,
    marginHorizontal: spacing.xl,
  },
  settingsButtonText: {
    ...typography.button,
    color: colors.text.inverse,
    textAlign: 'center',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  topSection: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: spacing.xl,
  },
  instructionsBox: {
    backgroundColor: 'rgba(17, 24, 39, 0.8)', // Semi-transparent dark
    borderRadius: 16,
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    alignItems: 'center',
  },
  instructionsIcon: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  instructionsTitle: {
    ...typography.h2,
    color: colors.text.inverse,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  instructionsText: {
    ...typography.body,
    color: colors.text.inverse,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  instructionsSubtext: {
    ...typography.caption,
    color: colors.text.tertiary,
    textAlign: 'center',
  },
  middleSection: {
    flex: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 280,
    height: 280,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: colors.primary,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  scanningIndicator: {
    backgroundColor: colors.primary + 'DD',
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  scanningText: {
    ...typography.bodyBold,
    color: colors.text.inverse,
  },
  scannedIndicator: {
    backgroundColor: colors.success + 'DD',
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  scannedText: {
    ...typography.bodyBold,
    color: colors.text.inverse,
  },
  bottomSection: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: spacing.xl,
  },
  rescanButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
    minWidth: 200,
  },
  rescanButtonText: {
    ...typography.button,
    color: colors.text.inverse,
    textAlign: 'center',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.xl,
    borderWidth: 2,
    borderColor: colors.text.inverse,
    minWidth: 200,
  },
  cancelButtonText: {
    ...typography.button,
    color: colors.text.inverse,
    textAlign: 'center',
  },
})

