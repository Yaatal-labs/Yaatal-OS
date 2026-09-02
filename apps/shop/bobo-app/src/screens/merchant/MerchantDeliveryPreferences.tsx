/**
 * Merchant Delivery Preferences Screen
 * For merchants to configure their delivery options
 */

import React, { useState, useEffect } from 'react'
import { 
  View, 
  Text, 
  Switch, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert,
  ScrollView,
  ActivityIndicator
} from 'react-native'
import { useAuthStore } from '../../store/authStore'
import { deliveryService } from '@njooba/core'
import type { MerchantDeliveryPreferences } from '@njooba/core'

export const MerchantDeliveryPreferencesScreen = () => {
  const { profile } = useAuthStore()
  const [preferences, setPreferences] = useState<MerchantDeliveryPreferences>({
    default_method: 'bobo_managed',
    preferred_carriers: [],
    delivery_zones: [],
    pickup_available: false,
    delivery_cost_markup: 0,
    allow_customer_pickup: false,
    allow_self_delivery: false,
    allow_third_party: false,
    pickup_location: '',
    pickup_instructions: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadPreferences()
  }, [])

  const loadPreferences = async () => {
    if (!profile?.id) return
    
    try {
      setLoading(true)
      const prefs = await deliveryService.getMerchantPreferences(profile.id)
      setPreferences(prefs)
    } catch (error) {
      console.error('Load preferences error:', error)
      Alert.alert('Erreur', 'Impossible de charger les préférences de livraison')
    } finally {
      setLoading(false)
    }
  }

  const savePreferences = async () => {
    if (!profile?.id) return
    
    setSaving(true)
    try {
      const result = await deliveryService.updateMerchantPreferences(
        profile.id,
        preferences
      )
      
      if (result) {
        Alert.alert('Succès', 'Préférences de livraison enregistrées')
      } else {
        Alert.alert('Erreur', 'Impossible d\'enregistrer les préférences')
      }
    } catch (error) {
      console.error('Save preferences error:', error)
      Alert.alert('Erreur', 'Une erreur est survenue lors de l\'enregistrement')
    } finally {
      setSaving(false)
    }
  }

  const updatePreference = (key: keyof MerchantDeliveryPreferences, value: any) => {
    setPreferences(prev => ({
      ...prev,
      [key]: value
    }))
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#F2A541" />
        <Text>Chargement des préférences...</Text>
      </View>
    )
  }

  if (!profile?.is_merchant) {
    return (
      <View style={styles.container}>
        <Text style={styles.noAccessText}>Accès réservé aux marchands</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Préférences de Livraison</Text>
      <Text style={styles.subtitle}>
        Configurez comment vous souhaitez gérer les livraisons de vos produits
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Méthode par défaut</Text>
        
        <View style={styles.optionRow}>
          <Text style={styles.optionText}>BOBO Moto</Text>
          <Switch
            value={preferences.default_method === 'bobo_managed'}
            onValueChange={(value) => 
              updatePreference('default_method', value ? 'bobo_managed' : preferences.default_method)
            }
            trackColor={{ false: '#767577', true: '#E07856' }}
            thumbColor={preferences.default_method === 'bobo_managed' ? '#fff' : '#f4f3f4'}
          />
        </View>
        
        <View style={styles.optionRow}>
          <Text style={styles.optionText}>Livraison par mes soins</Text>
          <Switch
            value={preferences.default_method === 'merchant_self'}
            onValueChange={(value) => 
              updatePreference('default_method', value ? 'merchant_self' : preferences.default_method)
            }
            trackColor={{ false: '#767577', true: '#E07856' }}
            thumbColor={preferences.default_method === 'merchant_self' ? '#fff' : '#f4f3f4'}
          />
        </View>
        
        <View style={styles.optionRow}>
          <Text style={styles.optionText}>Transporteur externe</Text>
          <Switch
            value={preferences.default_method === 'third_party'}
            onValueChange={(value) => 
              updatePreference('default_method', value ? 'third_party' : preferences.default_method)
            }
            trackColor={{ false: '#767577', true: '#E07856' }}
            thumbColor={preferences.default_method === 'third_party' ? '#fff' : '#f4f3f4'}
          />
        </View>
        
        <View style={styles.optionRow}>
          <Text style={styles.optionText}>Retrait par le client</Text>
          <Switch
            value={preferences.default_method === 'customer_pickup'}
            onValueChange={(value) => 
              updatePreference('default_method', value ? 'customer_pickup' : preferences.default_method)
            }
            trackColor={{ false: '#767577', true: '#E007856' }}
            thumbColor={preferences.default_method === 'customer_pickup' ? '#fff' : '#f4f3f4'}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Options de livraison</Text>
        
        <View style={styles.optionRow}>
          <Text style={styles.optionText}>Autoriser le retrait par le client</Text>
          <Switch
            value={preferences.allow_customer_pickup}
            onValueChange={(value) => updatePreference('allow_customer_pickup', value)}
            trackColor={{ false: '#767577', true: '#E07856' }}
            thumbColor={preferences.allow_customer_pickup ? '#fff' : '#f4f3f4'}
          />
        </View>
        
        <View style={styles.optionRow}>
          <Text style={styles.optionText}>Gérer mes propres livraisons</Text>
          <Switch
            value={preferences.allow_self_delivery}
            onValueChange={(value) => updatePreference('allow_self_delivery', value)}
            trackColor={{ false: '#767577', true: '#E07856' }}
            thumbColor={preferences.allow_self_delivery ? '#fff' : '#f4f3f4'}
          />
        </View>
        
        <View style={styles.optionRow}>
          <Text style={styles.optionText}>Autoriser les transporteurs externes</Text>
          <Switch
            value={preferences.allow_third_party}
            onValueChange={(value) => updatePreference('allow_third_party', value)}
            trackColor={{ false: '#767577', true: '#E07856' }}
            thumbColor={preferences.allow_third_party ? '#fff' : '#f4f3f4'}
          />
        </View>
      </View>

      {preferences.allow_customer_pickup && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Détails pour retrait</Text>
          
          <Text style={styles.label}>Adresse de retrait</Text>
          <TextInput
            style={styles.input}
            value={preferences.pickup_location}
            onChangeText={(text) => updatePreference('pickup_location', text)}
            placeholder="Adresse où les clients peuvent retirer leurs commandes"
            multiline
            numberOfLines={2}
          />
          
          <Text style={styles.label}>Instructions de retrait</Text>
          <TextInput
            style={styles.input}
            value={preferences.pickup_instructions}
            onChangeText={(text) => updatePreference('pickup_instructions', text)}
            placeholder="Instructions spéciales pour le retrait..."
            multiline
            numberOfLines={3}
          />
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Frais de livraison</Text>
        
        <Text style={styles.label}>Majoration des frais (%)</Text>
        <TextInput
          style={styles.input}
          value={preferences.delivery_cost_markup.toString()}
          onChangeText={(text) => updatePreference('delivery_cost_markup', parseInt(text) || 0)}
          placeholder="0"
          keyboardType="numeric"
        />
        <Text style={styles.hint}>
          Pourcentage de majoration que vous appliquez aux frais de livraison
        </Text>
      </View>

      <TouchableOpacity 
        style={styles.saveButton} 
        onPress={savePreferences}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.saveButtonText}>Enregistrer les préférences</Text>
        )}
      </TouchableOpacity>
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2D3561',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  section: {
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
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3561',
    marginBottom: 16,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  optionText: {
    fontSize: 16,
    color: '#1F1F1F',
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F1F1F',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1F1F1F',
    marginBottom: 12,
  },
  hint: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  saveButton: {
    backgroundColor: '#E07856',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  noAccessText: {
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 50,
  },
})