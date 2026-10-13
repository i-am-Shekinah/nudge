import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// passport-oauth2 forwards `state` only via authenticate options, so we
// derive it from ?client= here; Google echoes it back on the callback and
// Nest exposes it as req.authInfo. Anything not exactly 'mobile' is web —
// the redirect target is never taken from user input.
@Injectable()
export class GoogleClientGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const client = request.query?.client === 'mobile' ? 'mobile' : 'web';
    return { state: client };
  }
}
