import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';

const CODE_TTL_MS = 60_000;

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

@Injectable()
export class AuthCodeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async create(userId: string, isNewUser: boolean): Promise<string> {
    await this.prisma.authCode.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    const code = randomBytes(32).toString('base64url');
    await this.prisma.authCode.create({
      data: {
        codeHash: hashCode(code),
        userId,
        isNewUser,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });
    return code;
  }

  async exchange(
    code: string,
  ): Promise<{ token: string; isNewUser: boolean } | null> {
    const codeHash = hashCode(code);
    const record = await this.prisma.authCode.findUnique({
      where: { codeHash },
      include: { user: true },
    });
    if (!record || record.consumedAt || record.expiresAt < new Date()) {
      return null;
    }

    // Atomic consume: exactly one concurrent exchange can win.
    const { count } = await this.prisma.authCode.updateMany({
      where: { codeHash, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (count !== 1) {
      return null;
    }

    const token = this.jwtService.sign({
      sub: record.user.id,
      email: record.user.email,
    });
    return { token, isNewUser: record.isNewUser };
  }
}
