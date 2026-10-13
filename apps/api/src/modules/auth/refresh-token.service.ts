import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';

const REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60-day sliding idle expiry

function hashCode(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async issue(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.sessionRefreshToken.create({
      data: {
        tokenHash: hashCode(token),
        userId,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return token;
  }

  /**
   * Rotate: consume the presented token, mint a replacement, and return a
   * fresh access JWT. Returns null (and revokes the whole chain when reuse
   * of a consumed token is detected) on any invalid input.
   */
  async refresh(
    presented: string,
  ): Promise<{ token: string; refreshToken: string } | null> {
    const tokenHash = hashCode(presented);
    const record = await this.prisma.sessionRefreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!record) return null;

    if (record.consumedAt) {
      this.logger.warn(
        `Refresh token reuse detected for user ${record.userId}; revoking chain`,
      );
      await this.revokeAllForUser(record.userId);
      return null;
    }
    if (record.expiresAt < new Date()) return null;

    // Atomic consume: exactly one concurrent refresh can win.
    const { count } = await this.prisma.sessionRefreshToken.updateMany({
      where: { tokenHash, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (count !== 1) {
      await this.revokeAllForUser(record.userId);
      return null;
    }

    const refreshToken = await this.issue(record.userId);
    const token = this.jwtService.sign({
      sub: record.user.id,
      email: record.user.email,
    });
    return { token, refreshToken };
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.sessionRefreshToken.deleteMany({ where: { userId } });
  }
}
