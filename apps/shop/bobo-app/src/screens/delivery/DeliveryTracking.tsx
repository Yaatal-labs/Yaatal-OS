/**
 * Delivery Tracking Screen
 * For customers to track their order delivery status
 */

import React, { useState, useEffect } from 'react'
import { 
  View, 
  Text, 
  StyleSheet, 
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  ScrollView
} from 'react-native'
import { useAuthStore } from '../../store/authStore'
import { deliveryService, getDeliveryStatusText, getDeliveryStatusColor, type DeliveryRequest } from '@yaatal/core'

interface DeliveryTrackingProps {
  orderId: string
}

export const DeliveryTracking = ({ orderId }: DeliveryTrackingProps) => {
  const { user } = useAuthStore()
  const [delivery, setDelivery] = useState<DeliveryRequest | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDeliveryStatus()
  }, [orderId])

  const loadDeliveryStatus = async () => {
    try {
      setLoading(true)
      const deliveryData = await deliveryService.getDeliveryStatus(orderId)
      setDelivery(deliveryData)
    } catch (error) {
      console.error('Load delivery status error:', error)
      Alert.alert('Erreur', 'Impossible de charger le statut de livraison')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#F2A541" />
        <Text>Chargement du suivi de livraison...</Text>
      </View>
    )
  }

  if (!delivery) {
    return (
      <View style={styles.container}>
        <Text style={styles.noDeliveryText}>Aucune information de livraison disponible</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.orderTitle}>Suivi de la Commande</Text>
        <Text style={styles.orderId}>#{orderId}</Text>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <Text style={styles.statusText}>
            {getDeliveryStatusText(delivery.delivery_status)}
          </Text>
          <View style={[
            styles.statusIndicator, 
            { backgroundColor: getDeliveryStatusColor(delivery.delivery_status) }
          ]} />
        </View>

        <View style={styles.statusDetails}>
          <Text style={styles.detailLabel}>Méthode de livraison</Text>
          <Text style={styles.detailValue}>
            {delivery.delivery_method === 'bobo_managed' ? 'BOBO Moto' :
             delivery.delivery_method === 'merchant_self' ? 'Livraison par le vendeur' :
             delivery.delivery_method === 'third_party' ? 'Transporteur externe' :
             'Retrait par le client'}
          </Text>

          {delivery.delivery_cost !== undefined && (
            <>
              <Text style={styles.detailLabel}>Coût de livraison</Text>
              <Text style={styles.detailValue}>{delivery.delivery_cost} CFA</Text>
            </>
          )}

          {delivery.delivery_person_name && (
            <>
              <Text style={styles.detailLabel}>Livreur</Text>
              <Text style={styles.detailValue}>{delivery.delivery_person_name}</Text>
              
              {delivery.delivery_person_phone && (
                <>
                  <Text style={styles.detailLabel}>Contact</Text>
                  <TouchableOpacity 
                    style={styles.contactButton}
                    onPress={() => {
                      // In a real app, this would call the delivery person
                      Alert.alert('Appeler le livreur', delivery.delivery_person_phone)
                    }}
                  >
                    <Text style={styles.contactButtonText}>{delivery.delivery_person_phone}</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
        </View>
      </View>

      <View style={styles.addressCard}>
        <Text style={styles.sectionTitle}>Adresse de livraison</Text>
        <Text style={styles.address}>{delivery.dropoff_address}</Text>
      </View>

      {delivery.delivery_method !== 'customer_pickup' && (
        <View style={styles.addressCard}>
          <Text style={styles.sectionTitle}>Point de ramassage</Text>
          <Text style={styles.address}>{delivery.pickup_address}</Text>
        </View>
      )}

      {delivery.delivery_notes && (
        <View style={styles.notesCard}>
          <Text style={styles.sectionTitle}>Notes de livraison</Text>
          <Text style={styles.notes}>{delivery.delivery_notes}</Text>
        </View>
      )}

      {/* Delivery progress indicator */}
      <View style={styles.progressContainer}>
        <View style={styles.progressStep}>
          <View style={[
            styles.progressIndicator,
            delivery.delivery_status !== 'pending_dispatch' ? styles.progressCompleted : styles.progressPending
          ]} />
          <Text style={styles.progressLabel}>Commande passée</Text>
        </View>
        
        <View style={styles.progressLine} />
        
        <View style={styles.progressStep}>
          <View style={[
            styles.progressIndicator,
            ['assigned', 'picked_up', 'in_transit', 'delivered'].includes(delivery.delivery_status) 
              ? styles.progressCompleted 
              : styles.progressPending
          ]} />
          <Text style={styles.progressLabel}>Assigné au livreur</Text>
        </View>
        
        <View style={styles.progressLine} />
        
        <View style={styles.progressStep}>
          <View style={[
            styles.progressIndicator,
            ['picked_up', 'in_transit', 'delivered'].includes(delivery.delivery_status) 
              ? styles.progressCompleted 
              : styles.progressPending
          ]} />
          <Text style={styles.progressLabel}>En cours de livraison</Text>
        </View>
        
        <View style={styles.progressLine} />
        
        <View style={styles.progressStep}>
          <View style={[
            styles.progressIndicator,
            delivery.delivery_status === 'delivered' 
              ? styles.progressCompleted 
              : styles.progressPending
          ]} />
          <Text style={styles.progressLabel}>Livrée</Text>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF8F5',
    padding: 16,
  },
  header: {
    marginBottom: 20,
  },
  orderTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2D3561',
    textAlign: 'center',
  },
  orderId: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
  },
  statusCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F1F1F',
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusDetails: {
    marginTop: 12,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F1F1F',
    marginBottom: 12,
  },
  contactButton: {
    backgroundColor: '#E07856',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  contactButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  addressCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3561',
    marginBottom: 8,
  },
  address: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  notesCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  notes: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  progressContainer: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  progressStep: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  progressIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 12,
  },
  progressCompleted: {
    backgroundColor: '#10B981',
  },
  progressPending: {
    backgroundColor: '#D1D5DB',
  },
  progressLabel: {
    fontSize: 14,
    color: '#4B5563',
    flex: 1,
  },
  progressLine: {
    position: 'absolute',
    left: 10,
    top: 30,
    height: 30,
    width: 2,
    backgroundColor: '#D1D5DB',
    zIndex: -1,
  },
  noDeliveryText: {
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 50,
  },
})