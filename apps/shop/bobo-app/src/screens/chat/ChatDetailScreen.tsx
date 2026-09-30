/**
 * Chat Detail Screen
 * Realtime messaging UI
 */

import React, { useState, useEffect, useCallback } from 'react'
import { View, StyleSheet, ActivityIndicator } from 'react-native'
import { GiftedChat, IMessage, Bubble, Send } from 'react-native-gifted-chat'
import { useAuthStore } from '../../store/authStore'
import { chatService, type ChatMessage } from '@njooba/core'
import { colors, typography } from '../../theme'

export const ChatDetailScreen = ({ route }: any) => {
  const { conversationId, otherUser } = route.params
  const { profile } = useAuthStore()
  const [messages, setMessages] = useState<IMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadMessages()

    // Subscribe to realtime updates
    chatService.subscribeToMessages(conversationId, (newMessage: ChatMessage) => {
      // Avoid duplicates
      setMessages((previousMessages) => {
        if (previousMessages.some((m) => m._id === newMessage._id)) return previousMessages
        return GiftedChat.append(previousMessages, [newMessage as IMessage])
      })
    })

    return () => {
      chatService.unsubscribe()
    }
  }, [conversationId])

  const loadMessages = async () => {
    setIsLoading(true)
    const data = await chatService.getMessages(conversationId)
    setMessages(data as IMessage[])
    setIsLoading(false)
  }

  const onSend = useCallback(async (newMessages: IMessage[] = []) => {
    setMessages((previousMessages) => GiftedChat.append(previousMessages, newMessages))
    
    const text = newMessages[0].text
    if (profile) {
      await chatService.sendMessage(conversationId, text, profile.id)
    }
  }, [conversationId, profile])

  const renderBubble = (props: any) => (
    <Bubble
      {...props}
      wrapperStyle={{
        right: {
          backgroundColor: colors.primary,
        },
        left: {
          backgroundColor: colors.background.surface,
          borderWidth: 1,
          borderColor: colors.border.light,
        },
      }}
      textStyle={{
        right: {
          color: colors.text.inverse,
        },
        left: {
          color: colors.text.primary,
        },
      }}
    />
  )

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <GiftedChat
        messages={messages}
        onSend={(messages) => onSend(messages)}
        user={{
          _id: profile?.id || 'guest',
          name: profile?.username,
        }}
        renderBubble={renderBubble}
        placeholder="Écrivez un message..."
        alwaysShowSend
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.main,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.main,
  },
})
