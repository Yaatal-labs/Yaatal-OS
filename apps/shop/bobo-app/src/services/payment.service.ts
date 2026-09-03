/**
 * Payment Service for BOBO App
 * Handles payment processing for Senegalese mobile money (Wave, Orange Money)
 * Integrates with DEXCHANGE payment gateway
 * Currency: XOF (West African CFA franc)
 */

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Supported payment methods in Senegal
 */
export type PaymentMethod = 'wave' | 'orange_money' | 'cash' | 'card';

/**
 * Payment transaction status
 */
export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';

/**
 * Payment request data
 */
export interface PaymentRequest {
  orderId: string;
  amount: number; // Amount in XOF
  method: PaymentMethod;
  phone?: string; // Required for mobile money payments
  metadata?: PaymentMetadata;
}

/**
 * Optional metadata for payment tracking
 */
export interface PaymentMetadata {
  customerName?: string;
  customerId?: string;
  orderDescription?: string;
  deliveryAddress?: string;
  [key: string]: unknown;
}

/**
 * Payment response data
 */
export interface PaymentResponse {
  success: boolean;
  transactionId?: string;
  status: PaymentStatus;
  message: string;
  redirectUrl?: string; // For payment gateway redirects
  error?: string;
  errorCode?: string;
}

/**
 * Payment status check response
 */
export interface PaymentStatusResponse {
  transactionId: string;
  status: PaymentStatus;
  amount?: number;
  method?: PaymentMethod;
  timestamp?: string;
  details?: string;
}

/**
 * Refund request data
 */
export interface RefundRequest {
  transactionId: string;
  reason: string;
  amount?: number; // Optional partial refund amount in XOF
}

// ============================================================================
// Environment Configuration
// ============================================================================

// TODO: Add DEXCHANGE API credentials to environment variables
const DEXCHANGE_API_URL = process.env.EXPO_PUBLIC_DEXCHANGE_API_URL || 'https://api.dexchange.sn';
const DEXCHANGE_API_KEY = process.env.EXPO_PUBLIC_DEXCHANGE_API_KEY;
const DEXCHANGE_MERCHANT_ID = process.env.EXPO_PUBLIC_DEXCHANGE_MERCHANT_ID;

// ============================================================================
// Payment Service Class
// ============================================================================

/**
 * PaymentService - Singleton service for handling payments
 *
 * Provides methods for:
 * - Mobile money payments (Wave, Orange Money)
 * - Cash and card payment tracking
 * - Payment status checking
 * - Refund processing
 * - DEXCHANGE API integration
 */
export class PaymentService {
  private static instance: PaymentService;
  private isInitialized: boolean = false;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this.initialize();
  }

  /**
   * Get the singleton instance of PaymentService
   */
  public static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  /**
   * Initialize the payment service
   * Validates configuration and sets up necessary connections
   */
  private initialize(): void {
    if (this.isInitialized) {
      return;
    }

    // TODO: Validate DEXCHANGE credentials when implementing API integration
    if (!DEXCHANGE_API_KEY || !DEXCHANGE_MERCHANT_ID) {
      console.warn(
        'DEXCHANGE configuration missing. Payment service running in mock mode. ' +
        'Please set EXPO_PUBLIC_DEXCHANGE_API_KEY and EXPO_PUBLIC_DEXCHANGE_MERCHANT_ID environment variables.'
      );
    }

    this.isInitialized = true;
    console.log('PaymentService initialized');
  }

  // ==========================================================================
  // Main Payment Methods
  // ==========================================================================

  /**
   * Initialize a payment transaction
   *
   * Routes the payment to the appropriate handler based on payment method
   *
   * @param request - Payment request with order details and payment method
   * @returns PaymentResponse with transaction details
   *
   * @example
   * ```typescript
   * const response = await paymentService.initializePayment({
   *   orderId: 'ORD-12345',
   *   amount: 5000,
   *   method: 'wave',
   *   phone: '+221701234567',
   *   metadata: {
   *     customerName: 'Amadou Diallo',
   *     orderDescription: '2x Pizza Margherita'
   *   }
   * });
   * ```
   */
  async initializePayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      console.log(`[PaymentService] Initializing payment for order ${request.orderId}`);
      console.log(`[PaymentService] Method: ${request.method}, Amount: ${request.amount} XOF`);

      // Validate payment request
      const validationError = this.validatePaymentRequest(request);
      if (validationError) {
        return validationError;
      }

      // Route to appropriate payment handler
      switch (request.method) {
        case 'wave':
          return await this.processWavePayment(request.orderId, request.amount, request.phone!);

        case 'orange_money':
          return await this.processOrangeMoneyPayment(request.orderId, request.amount, request.phone!);

        case 'cash':
          return await this.processCashPayment(request.orderId, request.amount);

        case 'card':
          // TODO: Implement card payment processing
          return {
            success: false,
            status: 'failed',
            message: 'Card payments not yet implemented',
            errorCode: 'NOT_IMPLEMENTED',
          };

        default:
          return {
            success: false,
            status: 'failed',
            message: `Unsupported payment method: ${request.method}`,
            errorCode: 'INVALID_PAYMENT_METHOD',
          };
      }
    } catch (error) {
      return this.handleUnexpectedError(error);
    }
  }

  /**
   * Check the status of a payment transaction
   *
   * @param transactionId - Unique transaction identifier
   * @returns Current payment status
   *
   * @example
   * ```typescript
   * const status = await paymentService.checkPaymentStatus('TXN-WAVE-1234567890');
   * if (status === 'completed') {
   *   // Process order fulfillment
   * }
   * ```
   */
  async checkPaymentStatus(transactionId: string): Promise<PaymentStatus> {
    try {
      console.log(`[PaymentService] Checking status for transaction: ${transactionId}`);

      // TODO: Implement DEXCHANGE API call to check payment status
      // const response = await fetch(`${DEXCHANGE_API_URL}/transactions/${transactionId}/status`, {
      //   headers: {
      //     'Authorization': `Bearer ${DEXCHANGE_API_KEY}`,
      //     'X-Merchant-ID': DEXCHANGE_MERCHANT_ID,
      //   }
      // });
      // const data = await response.json();
      // return data.status;

      // Mock implementation: Return completed status for demo
      console.log(`[PaymentService] Mock response: Transaction ${transactionId} is completed`);
      return 'completed';
    } catch (error) {
      console.error('[PaymentService] Error checking payment status:', error);
      return 'failed';
    }
  }

  // ==========================================================================
  // Payment Method Handlers
  // ==========================================================================

  /**
   * Process a Wave mobile money payment
   *
   * @param orderId - Order identifier
   * @param amount - Payment amount in XOF
   * @param phone - Customer's Wave phone number (format: +221XXXXXXXXX)
   * @returns PaymentResponse with transaction details
   */
  async processWavePayment(
    orderId: string,
    amount: number,
    phone: string
  ): Promise<PaymentResponse> {
    try {
      console.log(`[PaymentService] Processing Wave payment`);
      console.log(`[PaymentService] Order: ${orderId}, Amount: ${amount} XOF, Phone: ${phone}`);

      // TODO: Implement DEXCHANGE Wave API integration
      // const response = await fetch(`${DEXCHANGE_API_URL}/payments/wave/initiate`, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${DEXCHANGE_API_KEY}`,
      //     'X-Merchant-ID': DEXCHANGE_MERCHANT_ID,
      //   },
      //   body: JSON.stringify({
      //     orderId,
      //     amount,
      //     phone,
      //     currency: 'XOF',
      //     callbackUrl: `${APP_URL}/api/payments/callback`,
      //   }),
      // });
      // const data = await response.json();

      // Mock implementation
      const transactionId = this.generateTransactionId('WAVE');
      const mockResponse: PaymentResponse = {
        success: true,
        transactionId,
        status: 'processing',
        message: `Wave payment initiated. Customer will receive a prompt on ${phone}`,
      };

      console.log(`[PaymentService] Wave payment initiated. Transaction ID: ${transactionId}`);
      return mockResponse;
    } catch (error) {
      return this.handlePaymentError(error, 'Wave payment failed');
    }
  }

  /**
   * Process an Orange Money payment
   *
   * @param orderId - Order identifier
   * @param amount - Payment amount in XOF
   * @param phone - Customer's Orange Money phone number (format: +221XXXXXXXXX)
   * @returns PaymentResponse with transaction details
   */
  async processOrangeMoneyPayment(
    orderId: string,
    amount: number,
    phone: string
  ): Promise<PaymentResponse> {
    try {
      console.log(`[PaymentService] Processing Orange Money payment`);
      console.log(`[PaymentService] Order: ${orderId}, Amount: ${amount} XOF, Phone: ${phone}`);

      // TODO: Implement DEXCHANGE Orange Money API integration
      // const response = await fetch(`${DEXCHANGE_API_URL}/payments/orange-money/initiate`, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${DEXCHANGE_API_KEY}`,
      //     'X-Merchant-ID': DEXCHANGE_MERCHANT_ID,
      //   },
      //   body: JSON.stringify({
      //     orderId,
      //     amount,
      //     phone,
      //     currency: 'XOF',
      //     callbackUrl: `${APP_URL}/api/payments/callback`,
      //   }),
      // });
      // const data = await response.json();

      // Mock implementation
      const transactionId = this.generateTransactionId('OM');
      const mockResponse: PaymentResponse = {
        success: true,
        transactionId,
        status: 'processing',
        message: `Orange Money payment initiated. Customer will receive a prompt on ${phone}`,
      };

      console.log(`[PaymentService] Orange Money payment initiated. Transaction ID: ${transactionId}`);
      return mockResponse;
    } catch (error) {
      return this.handlePaymentError(error, 'Orange Money payment failed');
    }
  }

  /**
   * Process a cash payment (tracking only)
   *
   * @param orderId - Order identifier
   * @param amount - Payment amount in XOF
   * @returns PaymentResponse with transaction details
   */
  async processCashPayment(
    orderId: string,
    amount: number
  ): Promise<PaymentResponse> {
    try {
      console.log(`[PaymentService] Processing cash payment`);
      console.log(`[PaymentService] Order: ${orderId}, Amount: ${amount} XOF`);

      // Cash payments are tracked but not processed through payment gateway
      const transactionId = this.generateTransactionId('CASH');
      const response: PaymentResponse = {
        success: true,
        transactionId,
        status: 'pending',
        message: `Cash payment of ${amount} XOF recorded for order ${orderId}. Payment will be collected on delivery.`,
      };

      console.log(`[PaymentService] Cash payment recorded. Transaction ID: ${transactionId}`);
      return response;
    } catch (error) {
      return this.handlePaymentError(error, 'Cash payment tracking failed');
    }
  }

  // ==========================================================================
  // Refund Methods
  // ==========================================================================

  /**
   * Process a payment refund
   *
   * @param transactionId - Original transaction identifier
   * @param reason - Reason for the refund
   * @returns PaymentResponse with refund details
   *
   * @example
   * ```typescript
   * const refund = await paymentService.refundPayment(
   *   'TXN-WAVE-1234567890',
   *   'Order cancelled by customer'
   * );
   * ```
   */
  async refundPayment(
    transactionId: string,
    reason: string
  ): Promise<PaymentResponse> {
    try {
      console.log(`[PaymentService] Processing refund for transaction: ${transactionId}`);
      console.log(`[PaymentService] Reason: ${reason}`);

      // Validate inputs
      if (!transactionId || !transactionId.trim()) {
        return {
          success: false,
          status: 'failed',
          message: 'Transaction ID is required',
          errorCode: 'VALIDATION_ERROR',
        };
      }

      if (!reason || !reason.trim()) {
        return {
          success: false,
          status: 'failed',
          message: 'Refund reason is required',
          errorCode: 'VALIDATION_ERROR',
        };
      }

      // TODO: Implement DEXCHANGE refund API integration
      // const response = await fetch(`${DEXCHANGE_API_URL}/payments/${transactionId}/refund`, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${DEXCHANGE_API_KEY}`,
      //     'X-Merchant-ID': DEXCHANGE_MERCHANT_ID,
      //   },
      //   body: JSON.stringify({
      //     reason,
      //     // amount: Optional partial refund amount
      //   }),
      // });
      // const data = await response.json();

      // Mock implementation
      const refundTransactionId = this.generateTransactionId('REFUND');
      const mockResponse: PaymentResponse = {
        success: true,
        transactionId: refundTransactionId,
        status: 'refunded',
        message: `Refund initiated for transaction ${transactionId}. Funds will be returned within 3-5 business days.`,
      };

      console.log(`[PaymentService] Refund processed. Refund ID: ${refundTransactionId}`);
      return mockResponse;
    } catch (error) {
      return this.handlePaymentError(error, 'Refund processing failed');
    }
  }

  // ==========================================================================
  // Validation & Utility Methods
  // ==========================================================================

  /**
   * Validate payment request data
   */
  private validatePaymentRequest(request: PaymentRequest): PaymentResponse | null {
    // Validate order ID
    if (!request.orderId || !request.orderId.trim()) {
      return {
        success: false,
        status: 'failed',
        message: 'Order ID is required',
        errorCode: 'VALIDATION_ERROR',
      };
    }

    // Validate amount
    if (!request.amount || request.amount <= 0) {
      return {
        success: false,
        status: 'failed',
        message: 'Valid payment amount is required',
        errorCode: 'VALIDATION_ERROR',
      };
    }

    // Minimum payment amount check (e.g., 100 XOF)
    if (request.amount < 100) {
      return {
        success: false,
        status: 'failed',
        message: 'Payment amount must be at least 100 XOF',
        errorCode: 'VALIDATION_ERROR',
      };
    }

    // Validate phone number for mobile money payments
    if (request.method === 'wave' || request.method === 'orange_money') {
      if (!request.phone || !request.phone.trim()) {
        return {
          success: false,
          status: 'failed',
          message: 'Phone number is required for mobile money payments',
          errorCode: 'VALIDATION_ERROR',
        };
      }

      // Basic Senegalese phone number validation (+221XXXXXXXXX)
      const phoneRegex = /^\+221[0-9]{9}$/;
      if (!phoneRegex.test(request.phone)) {
        return {
          success: false,
          status: 'failed',
          message: 'Invalid phone number format. Expected: +221XXXXXXXXX',
          errorCode: 'VALIDATION_ERROR',
        };
      }
    }

    // Validate payment method
    const validMethods: PaymentMethod[] = ['wave', 'orange_money', 'cash', 'card'];
    if (!validMethods.includes(request.method)) {
      return {
        success: false,
        status: 'failed',
        message: 'Invalid payment method',
        errorCode: 'VALIDATION_ERROR',
      };
    }

    return null; // No validation errors
  }

  /**
   * Generate a unique transaction ID
   */
  private generateTransactionId(prefix: string): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `TXN-${prefix}-${timestamp}${random}`;
  }

  /**
   * Format amount for display
   */
  public formatAmount(amount: number): string {
    return `${amount.toLocaleString('fr-SN')} XOF`;
  }

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  /**
   * Handle payment-specific errors
   */
  private handlePaymentError(error: unknown, defaultMessage: string): PaymentResponse {
    console.error('[PaymentService] Payment error:', error);

    const message = error instanceof Error ? error.message : defaultMessage;

    return {
      success: false,
      status: 'failed',
      message,
      errorCode: 'PAYMENT_ERROR',
    };
  }

  /**
   * Handle unexpected errors
   */
  private handleUnexpectedError(error: unknown): PaymentResponse {
    console.error('[PaymentService] Unexpected error:', error);

    const message = error instanceof Error
      ? error.message
      : 'An unexpected error occurred while processing payment';

    return {
      success: false,
      status: 'failed',
      message,
      errorCode: 'UNEXPECTED_ERROR',
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Default singleton instance of PaymentService
 * Use this for all payment operations
 *
 * @example
 * ```typescript
 * import { paymentService } from './services/payment.service';
 *
 * // Initialize a Wave payment
 * const result = await paymentService.initializePayment({
 *   orderId: 'ORD-12345',
 *   amount: 5000,
 *   method: 'wave',
 *   phone: '+221701234567',
 *   metadata: {
 *     customerName: 'Amadou Diallo',
 *     orderDescription: '2x Pizza Margherita'
 *   }
 * });
 *
 * // Check payment status
 * const status = await paymentService.checkPaymentStatus(result.transactionId!);
 *
 * // Process a refund
 * const refund = await paymentService.refundPayment(
 *   result.transactionId!,
 *   'Order cancelled by customer'
 * );
 * ```
 */
export const paymentService = PaymentService.getInstance();
