/**
 * Authentication Service - PowerSync Version
 * Handles authentication with offline capability
 */

import { powerSyncService } from '../lib/powersync/service';
import {
  validateEmail,
  validatePassword,
  validateUsername,
  validatePhoneNumber,
  generateSKU,
} from '../utils/validation'
import type { Profile, SignupFormData, LoginFormData } from '../types/models'

export class AuthService {
  /**
   * Sign up new user (saves to local SQLite, queues for sync)
   */
  async signUp(data: SignupFormData): Promise<{
    success: boolean
    user?: any
    profile?: Profile
    error?: string
  }> {
    try {
      // Validate inputs
      const emailValidation = validateEmail(data.email)
      if (!emailValidation.valid) {
        return { success: false, error: emailValidation.error }
      }

      const passwordValidation = validatePassword(data.password)
      if (!passwordValidation.valid) {
        return { success: false, error: passwordValidation.error }
      }

      const usernameValidation = validateUsername(data.username)
      if (!usernameValidation.valid) {
        return { success: false, error: usernameValidation.error }
      }

      if (data.password !== data.passwordConfirm) {
        return { success: false, error: 'Les mots de passe ne correspondent pas' }
      }

      // Create user profile in local SQLite
      const profileId = this.generateUUID();
      const userId = this.generateUUID(); // In a real app, this would come from auth provider
      const now = new Date().toISOString();

      const insertQuery = `
        INSERT INTO profiles (
          id, username, full_name, avatar_url, bio, phone_number, is_merchant,
          level, xp, streak_days, last_activity_date, total_posts, total_sales,
          delivery_method, preferred_carriers, delivery_zones, pickup_available,
          delivery_cost_markup, allow_customer_pickup, allow_self_delivery,
          allow_third_party, pickup_location, pickup_instructions,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await powerSyncService.executeWrite(insertQuery, [
        profileId,
        data.username.trim(),
        null, // full_name
        null, // avatar_url
        null, // bio
        null, // phone_number
        data.isMerchant ? 1 : 0, // is_merchant (boolean as integer)
        1, // level
        0, // xp
        0, // streak_days
        now, // last_activity_date
        0, // total_posts
        0, // total_sales
        'bobo_managed', // delivery_method
        '[]', // preferred_carriers (JSON string)
        '[]', // delivery_zones (JSON string)
        0, // pickup_available (boolean as integer)
        0, // delivery_cost_markup
        0, // allow_customer_pickup (boolean as integer)
        0, // allow_self_delivery (boolean as integer)
        0, // allow_third_party (boolean as integer)
        null, // pickup_location
        null, // pickup_instructions
        now, // created_at
        now  // updated_at
      ]);

      // Return mock user and profile
      const user = {
        id: userId,
        email: data.email.trim().toLowerCase(),
      };

      const profile: Profile = {
        id: profileId,
        user_id: userId,
        username: data.username.trim(),
        is_merchant: data.isMerchant,
        level: 1,
        xp: 0,
        streak_days: 0,
        total_posts: 0,
        total_sales: 0,
        created: now,
        updated: now,
      };

      return {
        success: true,
        user,
        profile,
      }
    } catch (error: any) {
      console.error('Signup error:', error)

      return {
        success: false,
        error: 'Erreur lors de l\'inscription. Veuillez réessayer.',
      }
    }
  }

  /**
   * Sign in existing user
   */
  async signIn(data: LoginFormData): Promise<{
    success: boolean
    user?: any
    profile?: Profile
    error?: string
  }> {
    try {
      // Validate inputs
      const emailValidation = validateEmail(data.email)
      if (!emailValidation.valid) {
        return { success: false, error: emailValidation.error }
      }

      if (!data.password) {
        return { success: false, error: 'Le mot de passe est requis' }
      }

      // In a real implementation, this would authenticate with the backend
      // For now, we'll look for a profile with the email in username field
      // (this is just for demo purposes)
      const query = 'SELECT * FROM profiles WHERE username = ?';
      const profiles = await powerSyncService.executeQuery<Profile>(query, [data.email.trim()]);

      if (!profiles.length) {
        return {
          success: false,
          error: 'Email ou mot de passe incorrect',
        }
      }

      const profile = profiles[0];
      const user = {
        id: profile.user_id,
        email: data.email.trim().toLowerCase(),
      };

      // Update last activity
      await powerSyncService.executeWrite(
        'UPDATE profiles SET last_activity_date = ?, updated_at = ? WHERE id = ?',
        [new Date().toISOString(), new Date().toISOString(), profile.id]
      );

      return {
        success: true,
        user,
        profile,
      }
    } catch (error: any) {
      console.error('Sign in error:', error)

      return {
        success: false,
        error: 'Erreur lors de la connexion. Veuillez réessayer.',
      }
    }
  }

  /**
   * Sign out
   */
  async signOut(): Promise<{ success: boolean }> {
    try {
      // In a real implementation, this would clear auth tokens
      return { success: true }
    } catch (error) {
      console.error('Sign out error:', error)
      return { success: false }
    }
  }

  /**
   * Get current user
   */
  getCurrentUser() {
    // In a real implementation, this would return the authenticated user
    return null;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    // In a real implementation, this would check auth tokens
    return false;
  }

  /**
   * Get user profile
   */
  async getUserProfile(userId?: string): Promise<Profile | undefined> {
    try {
      if (!userId) {
        return undefined
      }

      const query = 'SELECT * FROM profiles WHERE user_id = ?';
      const profiles = await powerSyncService.executeQuery<Profile>(query, [userId]);

      return profiles[0] || undefined;
    } catch (error) {
      console.error('Get profile error:', error)
      return undefined
    }
  }

  /**
   * Update user profile (in local SQLite, queues for sync)
   */
  async updateProfile(
    profileId: string,
    updates: Partial<Profile>
  ): Promise<{
    success: boolean
    profile?: Profile
    error?: string
  }> {
    try {
      // Validate username if being updated
      if (updates.username) {
        const usernameValidation = validateUsername(updates.username)
        if (!usernameValidation.valid) {
          return { success: false, error: usernameValidation.error }
        }
      }

      // Build dynamic update query
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      if (updates.username) {
        updateFields.push('username = ?');
        updateValues.push(updates.username.trim());
      }
      if (updates.full_name !== undefined) {
        updateFields.push('full_name = ?');
        updateValues.push(updates.full_name);
      }
      if (updates.avatar_url !== undefined) {
        updateFields.push('avatar_url = ?');
        updateValues.push(updates.avatar_url);
      }
      if (updates.bio !== undefined) {
        updateFields.push('bio = ?');
        updateValues.push(updates.bio);
      }
      if (updates.phone_number !== undefined) {
        const phoneValidation = validatePhoneNumber(updates.phone_number)
        if (!phoneValidation.valid) {
          return { success: false, error: phoneValidation.error }
        }
        updateFields.push('phone_number = ?');
        updateValues.push(updates.phone_number);
      }
      if (updates.is_merchant !== undefined) {
        updateFields.push('is_merchant = ?');
        updateValues.push(updates.is_merchant ? 1 : 0); // boolean as integer
      }
      if (updates.level !== undefined) {
        updateFields.push('level = ?');
        updateValues.push(updates.level);
      }
      if (updates.xp !== undefined) {
        updateFields.push('xp = ?');
        updateValues.push(updates.xp);
      }
      if (updates.streak_days !== undefined) {
        updateFields.push('streak_days = ?');
        updateValues.push(updates.streak_days);
      }
      if (updates.total_posts !== undefined) {
        updateFields.push('total_posts = ?');
        updateValues.push(updates.total_posts);
      }
      if (updates.total_sales !== undefined) {
        updateFields.push('total_sales = ?');
        updateValues.push(updates.total_sales);
      }

      updateFields.push('updated_at = ?');
      updateValues.push(new Date().toISOString());
      updateValues.push(profileId); // For WHERE clause

      const query = `UPDATE profiles SET ${updateFields.join(', ')} WHERE id = ?`;
      await powerSyncService.executeWrite(query, updateValues);

      // Return updated profile
      const updatedProfile = await this.getUserProfile(profileId);

      return {
        success: true,
        profile: updatedProfile,
      }
    } catch (error: any) {
      console.error('Update profile error:', error)

      return {
        success: false,
        error: error.message || 'Erreur lors de la mise à jour du profil',
      }
    }
  }

  /**
   * Update profile avatar (placeholder)
   */
  async updateAvatar(
    profileId: string,
    imageUri: string
  ): Promise<{
    success: boolean
    profile?: Profile
    error?: string
  }> {
    try {
      // Update avatar in local SQLite
      await powerSyncService.executeWrite(
        'UPDATE profiles SET avatar_url = ?, updated_at = ? WHERE id = ?',
        [imageUri, new Date().toISOString(), profileId]
      );

      // Return updated profile
      const updatedProfile = await this.getUserProfile(profileId);

      return {
        success: true,
        profile: updatedProfile,
      }
    } catch (error) {
      console.error('Update avatar error:', error)
      return {
        success: false,
        error: 'Erreur lors de la mise à jour de la photo',
      }
    }
  }

  /**
   * Reset password (placeholder)
   */
  async requestPasswordReset(email: string): Promise<{
    success: boolean
    error?: string
  }> {
    try {
      const emailValidation = validateEmail(email)
      if (!emailValidation.valid) {
        return { success: false, error: emailValidation.error }
      }

      // In a real implementation, this would send a reset email
      // For now, just return success
      return { success: true }
    } catch (error) {
      console.error('Password reset request error:', error)
      return {
        success: false,
        error: 'Erreur lors de la demande de réinitialisation',
      }
    }
  }

  /**
   * Helper to generate UUID
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// Export singleton instance
export const authService = new AuthService()

// Export with PowerSync suffix for backwards compatibility
export const authServicePowerSync = authService
export type { AuthService as AuthServicePowerSync }