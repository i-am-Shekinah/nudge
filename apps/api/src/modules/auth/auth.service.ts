import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import { encryptToken, decryptToken } from '../../common/crypto.util.js';

export interface GoogleAuthPayload {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly encryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.encryptionKey =
      this.configService.get<string>('ENCRYPTION_KEY') ||
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  }

  async validateGoogleUser(payload: GoogleAuthPayload) {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ googleId: payload.googleId }, { email: payload.email }],
      },
    });

    const isNewUser = !existingUser;
    const encryptedAccessToken = encryptToken(payload.accessToken, this.encryptionKey);

    // Google only sends refreshToken on first consent unless prompt=consent is used.
    // Preserve existing encrypted refreshToken if not provided in callback.
    let encryptedRefreshToken = existingUser?.refreshToken || '';
    if (payload.refreshToken) {
      encryptedRefreshToken = encryptToken(payload.refreshToken, this.encryptionKey);
    }

    // Default token expiration is 1 hour
    const tokenExpiresAt = new Date(Date.now() + 3600 * 1000);

    const user = await this.prisma.user.upsert({
      where: { googleId: payload.googleId },
      create: {
        googleId: payload.googleId,
        email: payload.email,
        name: payload.name,
        avatarUrl: payload.avatarUrl,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt,
        gmailConnected: true,
      },
      update: {
        email: payload.email,
        name: payload.name,
        avatarUrl: payload.avatarUrl,
        accessToken: encryptedAccessToken,
        ...(encryptedRefreshToken ? { refreshToken: encryptedRefreshToken } : {}),
        tokenExpiresAt,
        gmailConnected: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        gmailConnected: true,
        timezone: true,
        notificationTime: true,
        reminderPreset: true,
        customReminders: true,
        createdAt: true,
      },
    });

    const jwt = this.jwtService.sign({
      sub: user.id,
      email: user.email,
    });

    this.logger.log(`User authenticated: ${user.email} (isNewUser: ${isNewUser})`);

    return {
      user,
      jwt,
      isNewUser,
    };
  }

  async getMe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        gmailConnected: true,
        timezone: true,
        notificationTime: true,
        reminderPreset: true,
        customReminders: true,
        createdAt: true,
      },
    });
  }

  /**
   * Helper to decrypt stored user tokens for background jobs & API services.
   */
  async getUserTokens(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        accessToken: true,
        refreshToken: true,
        tokenExpiresAt: true,
      },
    });

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    return {
      accessToken: decryptToken(user.accessToken, this.encryptionKey),
      refreshToken: user.refreshToken
        ? decryptToken(user.refreshToken, this.encryptionKey)
        : '',
      tokenExpiresAt: user.tokenExpiresAt,
    };
  }
}
