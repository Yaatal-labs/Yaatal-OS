/**
 * Delivery Person Registration Screen
 * For moto riders and delivery persons to join the platform
 */

import React, { useState } from 'react'
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert,
  ScrollView,
  ActivityIndicator
} from 'react-native'
import { deliveryService } from '@njooba/core'

export const DeliveryPersonRegistration = () => {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    zone: '',
    vehicle_type: 'moto' as 'moto' | 'car' | 'truck' | 'bicycle',
  })
  const [loading, setLoading] = useState(false)

  const handleRegister = async () => {
    if (!formData.name || !formData.phone || !formData.zone) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs requis')
      return
    }

    setLoading(true)
    try {
      const result = await deliveryService.registerDeliveryPerson({
        name: formData.name,
        phone: formData.phone,
        zone: formData.zone,
        vehicle_type: formData.vehicle_type,
      })

      if (result.success) {
        Alert.alert('Succès', 'Vous êtes maintenant enregistré en tant que livreur BOBO !', [
          { text: 'OK', onPress: () => {/* Navigate back */} }
        ])
      } else {
        Alert.alert('Erreur', result.error || 'Une erreur est survenue')
      }
    } catch (error) {
      console.error('Registration error:', error)
      Alert.alert('Erreur', 'Une erreur est survenue lors de l\'enregistrement')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Devenir Livreur BOBO</Text>
      <Text style={styles.subtitle}>
        Rejoignez notre réseau de livraison et gagnez de l'argent avec votre moto
      </Text>

      <View style={styles.form}>
        <Text style={styles.label}>Nom complet *</Text>
        <TextInput
          style={styles.input}
          value={formData.name}
          onChangeText={(text) => setFormData({...formData, name: text})}
          placeholder="Entrez votre nom complet"
        />

        <Text style={styles.label}>Numéro de téléphone *</Text>
        <TextInput
          style={styles.input}
          value={formData.phone}
          onChangeText={(text) => setFormData({...formData, phone: text})}
          placeholder="Ex: +221 77 123 45 67"
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Zone de livraison *</Text>
        <TextInput
          style={styles.input}
          value={formData.zone}
          onChangeText={(text) => setFormData({...formData, zone: text})}
          placeholder="Ex: Dakar, Pikine, Guédiawaye"
        />

        <Text style={styles.label}>Type de véhicule</Text>
        <View style={styles.vehicleOptions}>
          {(['moto', 'car', 'truck', 'bicycle'] as const).map((vehicle) => (
            <TouchableOpacity
              key={vehicle}
              style={[
                styles.vehicleOption,
                formData.vehicle_type === vehicle && styles.vehicleOptionSelected
              ]}
              onPress={() => setFormData({...formData, vehicle_type: vehicle})}
            >
              <Text style={[
                styles.vehicleText,
                formData.vehicle_type === vehicle && styles.vehicleTextSelected
              ]}>
                {vehicle === 'moto' ? 'Moto' : 
                 vehicle === 'car' ? 'Voiture' : 
                 vehicle === 'truck' ? 'Camion' : 'Vélo'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity 
          style={styles.registerButton} 
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.registerButtonText}>S'inscrire</Text>
          )}
        </TouchableOpacity>
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
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2D3561',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  form: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F1F1F',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1F1F1F',
  },
  vehicleOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  vehicleOption: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
  },
  vehicleOptionSelected: {
    backgroundColor: '#E07856',
  },
  vehicleText: {
    color: '#4B5563',
    fontSize: 14,
    fontWeight: '500',
  },
  vehicleTextSelected: {
    color: '#FFF',
  },
  registerButton: {
    backgroundColor: '#E07856',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 20,
  },
  registerButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
})