import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { AuthCodeService } from './auth-code.service.js';
import { Public } from './decorators/public.decorator.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { GoogleClientGuard } from './guards/google-client.guard.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authCodeService: AuthCodeService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get('google')
  @UseGuards(GoogleClientGuard)
  async googleAuth() {
    // Passport initiates the Google OAuth 2.0 flow
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleClientGuard)
  async googleAuthCallback(@Req() req: Request, @Res() res: Response) {
    const googleUser = req.user as any;
    const { user, jwt, isNewUser } =
      await this.authService.validateGoogleUser(googleUser);

    const client = (req as any).authInfo?.state === 'mobile' ? 'mobile' : 'web';

    if (client === 'mobile') {
      // Never put a session token in a deep link: hand over a 60-second,
      // single-use code the app exchanges at POST /auth/exchange.
      const code = await this.authCodeService.create(user.id, isNewUser);
      const targetUrl = new URL(
        this.configService.get<string>('MOBILE_REDIRECT_URL') ||
          'nudge://auth/callback',
      );
      targetUrl.searchParams.set('code', code);
      targetUrl.searchParams.set('isNewUser', String(isNewUser));
      return res.redirect(targetUrl.toString());
    }

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    // Set auth cookie as fallback
    res.cookie('nudge_token', jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Fragment, not query: the token never reaches server logs or referrers.
    const targetUrl = new URL('/auth/callback', frontendUrl);
    targetUrl.hash = `token=${encodeURIComponent(jwt)}&isNewUser=${isNewUser}`;

    return res.redirect(targetUrl.toString());
  }

  @Public()
  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  async exchangeCode(@Body() body: { code?: string }) {
    const result = body.code
      ? await this.authCodeService.exchange(body.code)
      : null;
    if (!result) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    return result;
  }

  @Get('me')
  async getProfile(@CurrentUser('id') userId: string) {
    return this.authService.getMe(userId);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('nudge_token');
    return { success: true, message: 'Logged out successfully' };
  }
}
