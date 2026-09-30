/**
 * Delivery Dashboard Screen
 * Admin interface for managing deliveries
 */

import React, { useState, useEffect } from 'react'
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet, 
  Alert,
  ActivityIndicator,
  RefreshControl
} from 'react-native'
import { useAuthStore } from '../../store/authStore'
import { deliveryService } from '@yaatal/core'
import { getDeliveryStatusText, getDeliveryStatusColor, type DeliveryRequest, type DeliveryPerson } from '@yaatal/core'

export const DeliveryDashboard = () => {
  const { profile } = useAuthStore()
  const [deliveries, setDeliveries] = useState<DeliveryRequest[]>([])
  const [deliveryPersons, setDeliveryPersons] = useState<DeliveryPerson[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Only show this screen for admin/merchant users
  const isAdmin = profile?.username === 'admin' || profile?.is_merchant

  useEffect(() => {
    if (isAdmin) {
      loadDeliveries()
      loadDeliveryPersons()
    }
  }, [isAdmin])

  const loadDeliveries = async () => {
    try {
      // In a real implementation, this would fetch from Engine
      // For now, we'll simulate with mock data
      const mockDeliveries: DeliveryRequest[] = [
        {
          id: '1',
          order_id: 'order1',
          merchant_id: 'merchant1',
          delivery_method: 'bobo_managed',
          delivery_status: 'pending_dispatch',
          pickup_address: 'Marché Sandaga, Dakar',
          dropoff_address: 'Avenue Malick Sy, Dakar',
          delivery_cost: 750,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: '2',
          order_id: 'order2',
          merchant_id: 'merchant2',
          delivery_method: 'customer_pickup',
          delivery_status: 'customer_pickup_scheduled',
          pickup_address: 'Boutique Fashion Plus, Pikine',
          dropoff_address: 'Boutique Fashion Plus, Pikine',
          delivery_cost: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      ]
      setDeliveries(mockDeliveries)
    } catch (error) {
      console.error('Load deliveries error:', error)
      Alert.alert('Erreur', 'Impossible de charger les livraisons')
    }
  }

  const loadDeliveryPersons = async () => {
    try {
      const persons = await deliveryService.getAvailableDeliveryPersons('Dakar')
      setDeliveryPersons(persons)
    } catch (error) {
      console.error('Load delivery persons error:', error)
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await loadDeliveries()
    await loadDeliveryPersons()
    setRefreshing(false)
  }

  const assignDelivery = async (deliveryId: string, personId: string) => {
    try {
      const result = await deliveryService.assignDelivery(deliveryId, personId)
      if (result.success) {
        Alert.alert('Succès', 'Livraison assignée avec succès')
        loadDeliveries() // Refresh the list
      } else {
        Alert.alert('Erreur', result.error || 'Impossible d\'assigner la livraison')
      }
    } catch (error) {
      console.error('Assign delivery error:', error)
      Alert.alert('Erreur', 'Une erreur est survenue lors de l\'assignation')
    }
  }

  const renderDelivery = ({ item }: { item: DeliveryRequest }) => (
    <View style={styles.deliveryCard}>
      <View style={styles.header}>
        <Text style={styles.orderId}>Commande: {item.order_id}</Text>
        <Text style={[styles.status, { color: getDeliveryStatusColor(item.delivery_status) }]}>
          {getDeliveryStatusText(item.delivery_status)}
        </Text>
      </View>
      
      <Text style={styles.method}>Méthode: {item.delivery_method}</Text>
      <Text style={styles.address}>Ramassage: {item.pickup_address}</Text>
      <Text style={styles.address}>Livraison: {item.dropoff_address}</Text>
      <Text style={styles.cost}>Coût: {item.delivery_cost} CFA</Text>
      
      {item.delivery_method === 'bobo_managed' && item.delivery_status === 'pending_dispatch' && (
        <View style={styles.assignSection}>
          <Text style={styles.assignLabel}>Assigner à:</Text>
          <FlatList
            data={deliveryPersons}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(person) => person.id}
            renderItem={({ item: person }) => (
              <TouchableOpacity
                style={styles.deliveryPersonButton}
                onPress={() => assignDelivery(item.id, person.id)}
              >
                <Text style={styles.deliveryPersonName}>{person.name}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  )

  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <Text style={styles.noAccessText}>Accès refusé. Vous devez être administrateur ou marchand.</Text>
      </View>
    )
  }

  if (loading && deliveries.length === 0) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#F2A541" />
        <Text>Chargement des livraisons...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Gestion des Livraisons</Text>
      
      <FlatList
        data={deliveries}
        keyExtractor={(item) => item.id}
        renderItem={renderDelivery}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF8F5',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2D3561',
    marginBottom: 16,
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: 16,
  },
  deliveryCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderId: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F1F1F',
  },
  status: {
    fontSize: 14,
    fontWeight: '600',
  },
  method: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  address: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 4,
  },
  cost: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1B4D3E',
    marginTop: 8,
  },
  assignSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  assignLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 8,
  },
  deliveryPersonButton: {
    backgroundColor: '#E07856',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  deliveryPersonName: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '500',
  },
  noAccessText: {
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 50,
  },
})