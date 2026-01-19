/**
 * QR Scanner - Web Implementation
 * Uses html5-qrcode library for QR code scanning
 */

import Html5QrcodeScanner from 'html5-qrcode/esm/html5-qrcode-scanner'
import { Html5QrcodeScanType, Html5QrcodeCameraScanConfig } from 'html5-qrcode'

export interface QRScannerProps {
  onScan: (data: string) => void
  onError: (error: string) => void
}

export interface QRScannerInstance {
  start: () => Promise<void>
  stop: () => Promise<void>
  destroy: () => Promise<void>
}

/**
 * Parse deep link from QR code data
 * Expected format: bobo://product/{productId}
 */
export const parseDeepLink = (
  data: string
): { type: string; productId: string } | null => {
  try {
    // Parse as URL
    const url = new URL(data)

    if (url.protocol === 'bobo:' && url.pathname.startsWith('//product/')) {
      const productId = url.pathname.replace('//product/', '')

      if (productId) {
        return {
          type: 'product',
          productId,
        }
      }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Create QR Scanner instance for web
 * Requires a container element with ID in the DOM
 */
export const createQRScanner = (
  containerId: string,
  props: QRScannerProps
): QRScannerInstance => {
  let scanner: any | null = null
  let isScanning = false

  // Ensure container exists
  const container = document.getElementById(containerId)
  if (!container) {
    throw new Error(`Container element with ID "${containerId}" not found`)
  }

  // Initialize scanner
  scanner = new (Html5QrcodeScanner as any)(
    containerId,
    {
      fps: 10,
      qrbox: {
        width: 250,
        height: 250,
      },
      remotePhishingWarning: false,
      showTorchButtonIfSupported: true,
      showZoomSliderIfSupported: true,
      formatsToSupport: ['QR_CODE'],
      maxAllowedScans: 1000,
      videoConstraints: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    } as any,
    false
  )

  return {
    /**
     * Start scanning
     */
    start: async () => {
      if (!scanner || isScanning) return

      try {
        await scanner.render(
          (decodedText: any) => {
            // Parse and validate deep link
            const deepLink = parseDeepLink(decodedText)

            if (deepLink) {
              props.onScan(decodedText)
            } else {
              props.onError(`Invalid QR code format: ${decodedText}`)
            }
          },
          (error: any) => {
            // Log but don't throw - continuous scanning produces many errors
            console.debug(`QR Code scan error: ${error}`)
          }
        )
        isScanning = true
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to start scanner'
        props.onError(message)
        throw error
      }
    },

    /**
     * Stop scanning
     */
    stop: async () => {
      if (!scanner || !isScanning) return

      try {
        await scanner.pause()
        isScanning = false
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to pause scanner'
        props.onError(message)
        throw error
      }
    },

    /**
     * Completely destroy scanner and cleanup
     */
    destroy: async () => {
      if (!scanner) return

      try {
        if (isScanning) {
          await scanner.pause()
        }
        await scanner.clear()
        scanner = null
        isScanning = false
      } catch (error) {
        console.warn('Error destroying scanner:', error)
      }
    },
  }
}

/**
 * React hook helper for QR Scanner
 * Usage in React component:
 *
 * const QRScannerComponent = ({ onScan, onError }: QRScannerProps) => {
 *   useEffect(() => {
 *     const scanner = createQRScanner('qr-reader', { onScan, onError })
 *     scanner.start()
 *     return () => scanner.destroy()
 *   }, [onScan, onError])
 *
 *   return (
 *     <div
 *       id="qr-reader"
 *       style={{
 *         width: '100%',
 *         height: '100%',
 *         position: 'relative',
 *       }}
 *     />
 *   )
 * }
 */

export const getQRScannerContainerProps = () => ({
  id: 'qr-reader',
  style: {
    width: '100%',
    height: '100%',
    position: 'relative' as const,
  },
})
