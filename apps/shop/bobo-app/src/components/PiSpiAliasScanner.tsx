/**
 * PI-SPI alias scanner — a modal, deliberately not a route.
 *
 * The buyer's payment address (SHID) is 36 characters; scanning the QR their
 * bank app shows beats typing it. That is the *RTP* flow, where the Engine
 * addresses a request-to-pay to the buyer. It is not the QR flow, where the
 * merchant presents a QR and the buyer pays from their own bank app without
 * BOBO's camera involved at all.
 *
 * This started life as a `mode` param on `QRScannerScreen` with an `onAlias`
 * callback passed through navigation params. That broke twice over: the
 * callback made the navigation state non-serializable, and the scanner lives
 * in the `Scanner` tab's stack while checkout is reached from another tab, so
 * the `navigate()` never resolved. A modal needs neither — the caller holds
 * the callback directly, and there is no route to resolve.
 */

import React, { useState } from 'react'
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native'
import {
  CameraView,
  useCameraPermissions,
  BarcodeScanningResult,
} from 'expo-camera'
import { parsePiSpiAlias } from '@yaatal/client'
import { colors, typography, spacing } from '../theme'

interface Props {
  visible: boolean
  onClose: () => void
  /** Called with a validated SHID. Never called with unparseable input. */
  onAlias: (alias: string) => void
}

export const PiSpiAliasScanner = ({ visible, onClose, onAlias }: Props) => {
  const [permission, requestPermission] = useCameraPermissions()
  const [error, setError] = useState<string | null>(null)

  const handleScan = ({ data }: BarcodeScanningResult) => {
    // `parsePiSpiAlias` returns null unless the payload is a valid PI-SPI QR
    // carrying a well-formed alias under the `int.bceao.pi` GUID, so a
    // stranger's QR cannot become the address we send a payment request to.
    const alias = parsePiSpiAlias(data)
    if (!alias) {
      setError("Ce QR code ne contient pas d'adresse de paiement PI-SPI")
      return
    }
    setError(null)
    onAlias(alias)
    onClose()
  }

  const body = () => {
    if (!permission) {
      return <Text style={styles.message}>Demande d'accès à la caméra...</Text>
    }

    if (!permission.granted) {
      return (
        <View style={styles.centered}>
          <Text style={styles.icon}>📷</Text>
          <Text style={styles.title}>Caméra non autorisée</Text>
          <Text style={styles.message}>
            BOBO a besoin de la caméra pour lire votre adresse de paiement.
          </Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={
              permission.canAskAgain
                ? requestPermission
                : () => Linking.openSettings()
            }
          >
            <Text style={styles.actionButtonText}>
              {permission.canAskAgain ? 'Autoriser' : 'Ouvrir les paramètres'}
            </Text>
          </TouchableOpacity>
        </View>
      )
    }

    return (
      <CameraView
        style={styles.camera}
        facing="back"
        // Re-arm after a bad scan: the buyer may be holding the wrong QR.
        onBarcodeScanned={error ? undefined : handleScan}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      >
        <View style={styles.overlay}>
          <Text style={styles.instructions}>
            Scannez le QR de votre adresse de paiement
          </Text>
          <View style={styles.frame} />
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => setError(null)}
              >
                <Text style={styles.actionButtonText}>Réessayer</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </CameraView>
    )
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      <View style={styles.container}>
        {body()}
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Annuler</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.main },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  camera: { flex: 1 },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 16,
  },
  instructions: {
    ...typography.body,
    color: '#fff',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  icon: { fontSize: 48, marginBottom: spacing.md },
  title: { ...typography.h3, color: colors.text.primary, marginBottom: spacing.sm },
  message: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  errorBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.background.main,
    alignItems: 'center',
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  actionButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  actionButtonText: { ...typography.button, color: '#fff' },
  closeButton: { padding: spacing.lg, alignItems: 'center' },
  closeButtonText: { ...typography.button, color: colors.text.secondary },
})
