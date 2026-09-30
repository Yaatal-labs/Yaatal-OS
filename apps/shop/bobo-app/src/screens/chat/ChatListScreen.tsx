/**
 * Chat List Screen
 * Displays user's conversations
 */

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { useAuthStore } from '../../store/authStore'
import { chatService, formatDateTime, getAvatarUrl, type Conversation } from '@yaatal/core'
import { colors, typography, spacing } from '../../theme'

export const ChatListScreen = ({ navigation }: any) => {
  const { profile } = useAuthStore()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadConversations = async () => {
    if (!profile) return
    setIsLoading(true)
    const data = await chatService.getConversations(profile.id)
    setConversations(data)
    setIsLoading(false)
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await loadConversations()
    setRefreshing(false)
  }

  useEffect(() => {
    loadConversations()
  }, [profile])

  const renderItem = ({ item }: { item: Conversation }) => {
    // Find other participant (customer or merchant based on current user)
    const otherUser = profile?.id === item.customer_id
      ? item.expand?.merchant_id
      : item.expand?.customer_id
    const avatarUrl = otherUser?.avatar_url
      ? getAvatarUrl(otherUser.avatar_url, 50)
      : undefined

    return (
      <TouchableOpacity
        style={styles.chatCard}
        onPress={() => navigation.navigate('ChatDetail', { conversationId: item.id, otherUser })}
      >
        <Image
          source={{ uri: avatarUrl || 'https://via.placeholder.com/50' }}
          style={styles.avatar}
        />
        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={styles.username}>{otherUser?.username || 'Utilisateur'}</Text>
            <Text style={styles.date}>{formatDateTime(item.updated)}</Text>
          </View>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.last_message || 'Démarrer la conversation'}
          </Text>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Aucune message pour le moment</Text>
            </View>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.main,
  },
  listContent: {
    padding: spacing.base,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.background.surface,
    borderRadius: 12,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: spacing.md,
    backgroundColor: colors.background.subtle,
  },
  chatInfo: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  username: {
    ...typography.h3,
    fontSize: 16,
    color: colors.text.primary,
  },
  date: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
  lastMessage: {
    ...typography.body,
    color: colors.text.secondary,
    fontSize: 14,
  },
  empty: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.text.secondary,
  },
})
