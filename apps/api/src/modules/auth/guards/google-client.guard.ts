import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// passport-oauth2 forwards `state` only via authenticate options, so we
// derive it from ?client= here; Google echoes it back on the callback's
// query string. Anything not exactly 'mobile' is web — the redirect
// target is never taken from user input.
@Injectable()
export class GoogleClientGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const client = request.query?.client === 'mobile' ? 'mobile' : 'web';
    // passport-google-oauth20 reads accessType/prompt ONLY from these
    // per-request options — the constructor values are silently ignored.
    // select_account restores the account chooser; offline keeps the Gmail
    // refresh token flowing.
    return {
      state: client,
      accessType: 'offline',
      prompt: 'select_account consent',
    };
  }
}
