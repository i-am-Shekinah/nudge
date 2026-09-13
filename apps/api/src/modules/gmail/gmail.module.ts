import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GmailService } from './gmail.service.js';

@Module({
  imports: [AuthModule],
  providers: [GmailService],
  exports: [GmailService],
})
export class GmailModule {}
